import { X509Certificate } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

const XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

export type ResultadoAssinaturaXml =
  | {
      ok: true;
      conteudoAssinado: string;
      idAssinado: string;
      elemento: string;
      certificado: {
        cnpjs: string[];
        validoDe: Date;
        validoAte: Date;
        aparentaIcpBrasil: boolean;
        fingerprint256: string;
      };
    }
  | { ok: false; motivo: string };

/**
 * Verifica XMLDSig e devolve SOMENTE o nó autenticado pela assinatura.
 *
 * Verificar a assinatura e continuar lendo o documento original não basta:
 * wrapping attack põe um `infNFe` falso antes do assinado. O chamador extrai
 * valor/CFOP/CNPJ de `conteudoAssinado`, retornado por `getSignedReferences()`.
 */
export function verificarAssinaturaXml(
  xml: string,
  esperado: { elemento: "infNFe" | "infEvento"; id?: string },
): ResultadoAssinaturaXml {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const assinaturas = doc.getElementsByTagNameNS(XMLDSIG_NS, "Signature");
    if (assinaturas.length !== 1) {
      return {
        ok: false,
        motivo:
          assinaturas.length === 0
            ? "O XML não contém assinatura digital."
            : "O XML contém mais de uma assinatura digital.",
      };
    }

    const assinaturaNode = assinaturas.item(0);
    if (!assinaturaNode) {
      return { ok: false, motivo: "A assinatura digital não pôde ser lida." };
    }
    const certificadoNode = assinaturaNode
      .getElementsByTagNameNS(XMLDSIG_NS, "X509Certificate")
      .item(0);
    const certificadoBase64 = certificadoNode?.textContent?.replace(/\s+/g, "") ?? "";
    if (!certificadoBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(certificadoBase64)) {
      return { ok: false, motivo: "A assinatura não contém certificado X.509 válido." };
    }
    const pem = `-----BEGIN CERTIFICATE-----\n${certificadoBase64.match(/.{1,64}/g)?.join("\n") ?? certificadoBase64}\n-----END CERTIFICATE-----`;
    const x509 = new X509Certificate(pem);
    const assinaturaXml = new XMLSerializer().serializeToString(assinaturaNode);

    const verificador = new SignedXml({
      publicCert: pem,
      // Não aceita outro material de KeyInfo depois que o certificado acima foi
      // extraído e validado como X.509.
      getCertFromKeyInfo: () => null,
    });
    verificador.loadSignature(assinaturaXml);
    if (!verificador.checkSignature(xml)) {
      return { ok: false, motivo: "A assinatura digital do XML não confere." };
    }

    const referencias = verificador.getSignedReferences();
    if (referencias.length !== 1) {
      return {
        ok: false,
        motivo: `A assinatura protege ${referencias.length} referências; era esperada exatamente uma.`,
      };
    }

    const conteudoAssinado = referencias[0];
    const autenticado = new DOMParser().parseFromString(conteudoAssinado, "text/xml");
    const raiz = autenticado.documentElement;
    if (!raiz) {
      return { ok: false, motivo: "A referência assinada não contém elemento raiz." };
    }
    const elemento = (raiz.localName || raiz.nodeName.split(":").pop() || "").trim();
    const idAssinado = raiz.getAttribute("Id") ?? "";

    if (
      elemento !== esperado.elemento ||
      (esperado.id !== undefined && idAssinado !== esperado.id)
    ) {
      return {
        ok: false,
        motivo: `A assinatura protege ${elemento || "(elemento desconhecido)"}#${idAssinado || "(sem Id)"}, não ${esperado.elemento}${esperado.id ? `#${esperado.id}` : ""}.`,
      };
    }

    return {
      ok: true,
      conteudoAssinado,
      idAssinado,
      elemento,
      certificado: {
        cnpjs: [...new Set(x509.subject.match(/\b\d{14}\b/g) ?? [])],
        validoDe: new Date(x509.validFrom),
        validoAte: new Date(x509.validTo),
        aparentaIcpBrasil:
          /(?:^|\n)O=ICP-Brasil(?:\n|$)/.test(x509.subject) &&
          /(?:^|\n)O=ICP-Brasil(?:\n|$)/.test(x509.issuer) &&
          x509.ca === false,
        fingerprint256: x509.fingerprint256,
      },
    };
  } catch (falha) {
    return {
      ok: false,
      motivo: falha instanceof Error ? falha.message : "Falha ao validar a assinatura digital.",
    };
  }
}
