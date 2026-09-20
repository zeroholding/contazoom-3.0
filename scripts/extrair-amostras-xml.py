"""Extrai duas amostras XML de cada ZIP fiscal, sem tocar nos arquivos-fonte.

Uso:
    python scripts/extrair-amostras-xml.py "XML/XML GRUPO NEXUS 202608"

Saída:
    <raiz>/_AMOSTRAS_2_POR_ZIP/<caminho do zip>/<nome interno>.xml
    <raiz>/_AMOSTRAS_2_POR_ZIP/manifesto.json

O diretório XML inteiro já está no .gitignore. Este script existe para tornar o
mesmo teste repetível: não depende de clicar, nem de escolher à mão dois arquivos
"bonitos". Seleciona os dois primeiros nomes XML em ordem estável dentro de cada
ZIP.

Segurança:
- nunca extrai caminho vindo do ZIP; usa apenas o nome-base higienizado;
- ignora diretório e arquivo que não seja .xml;
- recusa amostra individual acima de 2 MiB;
- limita a duas entradas por ZIP;
- escreve somente dentro do diretório de saída fixo.
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath

MAX_SAMPLE_BYTES = 2 * 1024 * 1024
SAMPLES_PER_ZIP = 2
OUTPUT_NAME = "_AMOSTRAS_2_POR_ZIP"


def safe_segment(value: str) -> str:
    """Conserva letras/números e troca o resto por `_`, sem produzir vazio."""
    normalized = re.sub(r"[^\w.-]+", "_", value, flags=re.UNICODE).strip("._")
    return normalized[:120] or "sem_nome"


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "XML/XML GRUPO NEXUS 202608").resolve()
    if not root.is_dir():
        print(f'ERRO: pasta não encontrada: "{root}"', file=sys.stderr)
        return 1

    output = root / OUTPUT_NAME
    output.mkdir(parents=True, exist_ok=True)

    archives = sorted(
        path for path in root.rglob("*.zip")
        if OUTPUT_NAME not in path.parts
    )

    manifest: dict[str, object] = {
        "raiz": str(root),
        "destino": str(output),
        "zips": [],
    }

    total_samples = 0
    failures = 0

    for archive in archives:
        relative = archive.relative_to(root)
        archive_dir = output.joinpath(
            *[safe_segment(part) for part in relative.with_suffix("").parts]
        )
        archive_dir.mkdir(parents=True, exist_ok=True)

        result: dict[str, object] = {
            "zip": str(relative).replace("\\", "/"),
            "tamanho_zip": archive.stat().st_size,
            "xmls_no_zip": 0,
            "amostras": [],
            "erro": None,
        }

        try:
            with zipfile.ZipFile(archive) as zf:
                entries = sorted(
                    [
                        info
                        for info in zf.infolist()
                        if not info.is_dir()
                        and PurePosixPath(info.filename).suffix.lower() == ".xml"
                    ],
                    key=lambda info: info.filename.lower(),
                )
                result["xmls_no_zip"] = len(entries)

                for index, info in enumerate(entries[:SAMPLES_PER_ZIP], start=1):
                    if info.file_size <= 0:
                        continue
                    if info.file_size > MAX_SAMPLE_BYTES:
                        raise ValueError(
                            f"amostra {info.filename!r} tem {info.file_size} bytes "
                            f"(limite {MAX_SAMPLE_BYTES})"
                        )

                    data = zf.read(info)
                    # Nunca usa caminho do ZIP no destino. Além de path traversal,
                    # há zips de marketplace com diretórios absolutos de Windows.
                    basename = safe_segment(PurePosixPath(info.filename).name)
                    destination = archive_dir / f"{index:02d}_{basename}"
                    destination.write_bytes(data)

                    cast_samples = result["amostras"]
                    assert isinstance(cast_samples, list)
                    cast_samples.append({
                        "entrada": info.filename,
                        "bytes": len(data),
                        "extraido": str(destination.relative_to(root)).replace("\\", "/"),
                    })
                    total_samples += 1
        except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as exc:
            result["erro"] = str(exc)
            failures += 1

        cast_zips = manifest["zips"]
        assert isinstance(cast_zips, list)
        cast_zips.append(result)

        status = "ERRO" if result["erro"] else "OK"
        print(
            f"{status:4}  {str(relative):90} "
            f"xmls={result['xmls_no_zip']:5} amostras={len(result['amostras'])}"
            + (f"  {result['erro']}" if result["erro"] else "")
        )

    manifest["total_zips"] = len(archives)
    manifest["total_amostras"] = total_samples
    manifest["falhas"] = failures
    (output / "manifesto.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"\n{len(archives)} ZIP(s), {total_samples} amostra(s), {failures} falha(s). "
        f"Destino: {output}"
    )
    return 0 if failures == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
