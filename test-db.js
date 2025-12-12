const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://contazoom:contazoom123@127.0.0.1:5432/contazoom',
});

async function testConnection() {
    try {
        console.log('Connecting...');
        await client.connect();
        console.log('Connected successfully!');

        const res = await client.query('SELECT NOW()');
        console.log('Query result:', res.rows[0]);

        await client.end();
        console.log('Connection closed.');
    } catch (err) {
        console.error('Connection error:', err);
    }
}

testConnection();
