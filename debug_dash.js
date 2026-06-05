const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  const start = new Date(Date.UTC(2026, 5, 1, 3, 0, 0, 0));
  const end = new Date(Date.UTC(2026, 5, 2, 2, 59, 59, 999));
  
  const vendas = await prisma.meliVenda.findMany({
    where: { 
      conta: 'ELIDELU', 
      dataVenda: { gte: start, lte: end },
      status: 'pagos'
    },
    select: { 
      orderId: true, 
      dataVenda: true, 
      valorTotal: true, 
      frete: true, 
      taxaPlataforma: true 
    },
    distinct: ['orderId']
  });
  
  let log = 'Vendas Dashboard (Hoje):\\n\\n';
  let tV = 0;
  let tF = 0;
  let tTx = 0;
  
  vendas.forEach(v => {
    log += `Data UTC: ${v.dataVenda.toISOString()} | Data BRT: ${new Date(v.dataVenda.getTime() - 3*60*60*1000).toISOString()}\\n`;
    log += `ID: ${v.orderId} - Valor: ${v.valorTotal} - Frete: ${v.frete} - Taxa: ${v.taxaPlataforma}\\n\\n`;
    tV += Number(v.valorTotal);
    tF += Number(v.frete);
    tTx += Number(v.taxaPlataforma);
  });
  
  log += `TOTAL FINAL NO DASHBOARD:\\n`;
  log += `Valor Total: ${tV}\\n`;
  log += `Frete Total: ${tF}\\n`;
  log += `Taxas Totais: ${tTx}\\n`;
  log += `Qtd Vendas (Deduplicadas): ${vendas.length}\\n`;
  
  fs.writeFileSync('log_frete.txt', log);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
