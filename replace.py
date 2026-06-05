import sys

with open('src/app/components/views/ui/VendasTable.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_thead_tr = """              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[130px] premium-th">
                  Data / Canal
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[140px] premium-th">
                  Venda / Conta
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[180px] premium-th">
                  Produto / SKU
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[150px] premium-th">
                  Cliente / Envio
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[100px] premium-th">
                  Qtd / Unitário
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[160px] premium-th">
                  Financeiro Detalhado
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[130px] premium-th">
                  CMV / Margem
                </th>
              </tr>\n"""

# For the thead, we replace lines 332 to 451 (0-indexed 331 to 451)
del lines[331:451]
lines.insert(331, new_thead_tr)

with open('src/app/components/views/ui/VendasTable.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
