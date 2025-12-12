# 🐳 Guia de Configuração: PostgreSQL + Redis com Docker

## ⚠️ Passo 1: Iniciar Docker Desktop

**IMPORTANTE:** Antes de executar os comandos abaixo, você precisa:

1. Abrir o **Docker Desktop** no Windows
2. Aguardar até que apareça "Docker Desktop is running" na bandeja do sistema
3. Verificar se está rodando: o ícone da baleia deve estar visível

---

## 📦 Passo 2: Criar os Containers

Depois que o Docker Desktop estiver rodando, execute estes comandos no terminal:

### 🗄️ PostgreSQL

```bash
docker run -d \
  --name postgres-contazoom \
  -e POSTGRES_USER=contazoom \
  -e POSTGRES_PASSWORD=contazoom123 \
  -e POSTGRES_DB=contazoom \
  -p 5432:5432 \
  postgres:15-alpine
```

### 🔴 Redis

```bash
docker run -d \
  --name redis-contazoom \
  -p 6379:6379 \
  redis:7-alpine
```

---

## 🔧 Passo 3: Atualizar Variáveis de Ambiente

Edite o arquivo `.env.local` e adicione/atualize:

```bash
# PostgreSQL
DATABASE_URL="postgresql://contazoom:contazoom123@localhost:5432/contazoom"

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_ENABLED="true"
```

---

## 🎯 Passo 4: Executar Migrations do Prisma

Depois de criar o container PostgreSQL, execute:

```bash
npx prisma migrate dev
```

Isso vai criar todas as tabelas no banco de dados.

---

## ✅ Passo 5: Verificar se Está Funcionando

### Verificar containers rodando:
```bash
docker ps
```

Você deve ver algo assim:
```
CONTAINER ID   IMAGE                PORTS                    NAMES
abc123...      postgres:15-alpine   0.0.0.0:5432->5432/tcp   postgres-contazoom
def456...      redis:7-alpine       0.0.0.0:6379->6379/tcp   redis-contazoom
```

### Testar conexão PostgreSQL:
```bash
docker exec -it postgres-contazoom psql -U contazoom -d contazoom
```

Se conectar, digite `\dt` para ver as tabelas e `\q` para sair.

### Testar conexão Redis:
```bash
docker exec -it redis-contazoom redis-cli PING
```

Deve retornar: `PONG`

---

## 🔄 Passo 6: Reiniciar o Servidor Next.js

No terminal onde está rodando `npm run dev`:
1. Pressione `Ctrl+C` para parar
2. Execute novamente: `npm run dev`

---

## 🛠️ Comandos Úteis

### Parar containers:
```bash
docker stop postgres-contazoom redis-contazoom
```

### Iniciar containers (se já existem):
```bash
docker start postgres-contazoom redis-contazoom
```

### Ver logs:
```bash
docker logs postgres-contazoom
docker logs redis-contazoom
```

### Remover containers (se precisar recomeçar):
```bash
docker rm -f postgres-contazoom redis-contazoom
```

---

## 🎉 Pronto!

Depois de seguir todos os passos:

✅ PostgreSQL rodando na porta 5432  
✅ Redis rodando na porta 6379  
✅ Banco de dados criado e migrado  
✅ Aplicação conectada aos serviços  

**Agora você pode:**
- ✅ Criar contas de usuário (registro funcionando)
- ✅ Fazer login
- ✅ Sincronizar vendas do Mercado Livre com Redis

---

## ❓ Problemas Comuns

### "Error: connect ECONNREFUSED"
- Docker Desktop não está rodando
- Solução: Abra o Docker Desktop e aguarde iniciar

### "Container name already in use"
- Containers já existem
- Solução: Use `docker start` em vez de `docker run`

### "Port already allocated"
- Outra aplicação está usando a porta
- Solução: Pare a aplicação ou use outra porta

---

## 📊 Credenciais Configuradas

**PostgreSQL:**
- Host: `localhost`
- Port: `5432`
- Database: `contazoom`
- Username: `contazoom`
- Password: `contazoom123`

**Redis:**
- Host: `localhost`
- Port: `6379`
- No password (desenvolvimento local)
