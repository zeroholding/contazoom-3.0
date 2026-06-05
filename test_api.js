const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/meli/vendas');
    const data = await res.json();
    const order = data.vendas.find(v => v.id === "2000016689713262");
    if (order) {
      console.log("Frete:", order.frete);
      console.log("Margem:", order.margemContribuicao);
      console.log("shipping:", order.shipping);
    } else {
      console.log("Order not found");
    }
  } catch (err) {
    console.error(err);
  }
}

test();
