# Spec Studio + Google Drive (Workspace)

Os arquivos dos clientes e o backup do sistema ficam num **Drive compartilhado** da Spec.
Quem acessa é uma **conta de serviço** (um "robô" do Google), então nada depende de alguém estar logado.

Estrutura criada automaticamente:

```
Spec Studio (Drive compartilhado)
└── Spec Studio/
    ├── Clientes/
    │   └── Nome do Cliente (#1)/
    │       ├── Brutos/
    │       ├── Vídeos editados/
    │       ├── Gráficos/
    │       └── Referências/
    └── _sistema/            ← backup do banco (usuários, clientes, tarefas). Não mexa.
```

---

## 1. Criar o projeto no Google Cloud (5 min)

Entre com **guilherme@specmarketingdigital.com**.

1. Abra https://console.cloud.google.com/projectcreate
2. Nome do projeto: `Spec Studio` → **Criar**.
3. Abra https://console.cloud.google.com/apis/library/drive.googleapis.com (com o projeto `Spec Studio` selecionado no topo) → **Ativar**.

## 2. Criar a conta de serviço e a chave

1. Abra https://console.cloud.google.com/iam-admin/serviceaccounts → **+ Criar conta de serviço**.
2. Nome: `spec-studio` → **Criar e continuar** → pule as permissões → **Concluir**.
3. Copie o e-mail dela (algo como `spec-studio@spec-studio-123456.iam.gserviceaccount.com`).
4. Clique nela → aba **Chaves** → **Adicionar chave** → **Criar nova chave** → **JSON** → **Criar**.
   Um arquivo `.json` é baixado. **Guarde com cuidado: ele dá acesso ao Drive.**

> **Erro "A criação de chaves de conta de serviço está desativada"?**
> Contas Workspace novas bloqueiam isso por padrão. Como administrador:
> https://console.cloud.google.com/iam-admin/orgpolicies → procure
> **"Disable service account key creation"** (`iam.disableServiceAccountKeyCreation`) →
> **Gerenciar política** → **Substituir a política do pai** → **Desativado (não aplicar)** → **Salvar**.
> Se não aparecer a opção, dê a você mesmo o papel **Administrador de políticas da organização**
> em https://console.cloud.google.com/iam-admin/iam (nível organização) e tente de novo.

## 3. Criar o Drive compartilhado

1. Abra https://drive.google.com → **Drives compartilhados** → **+ Novo** → nome `Spec Studio`.
2. Dentro dele: **Gerenciar membros** → cole o e-mail da conta de serviço (passo 2.3) →
   papel **Administrador de conteúdo** → desmarque "Notificar" → **Compartilhar**.
3. Adicione também a equipe que deve ver os arquivos direto no Drive.
4. Copie o **ID** do Drive compartilhado: é o final do endereço quando ele está aberto,
   `https://drive.google.com/drive/folders/`**`0AbCdEfGhIjKlUk9PVA`**

## 4. Configurar no servidor (Render)

No serviço `spec-studio` → **Environment**:

| Variável | Valor |
|---|---|
| `DRIVE_ID` | o ID do passo 3.4 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | o conteúdo inteiro do arquivo `.json` (abra no Bloco de Notas, copie tudo e cole) |

Salve. O Render reinicia o sistema e, no log, deve aparecer:

```
Armazenamento: Google Drive compartilhado 0AbCd... (pasta "Spec Studio" ...)
```

Se aparecer erro, as causas mais comuns:
- **404 / File not found**: a conta de serviço não foi adicionada ao Drive compartilhado (passo 3.2) ou o `DRIVE_ID` está errado.
- **403 Drive API has not been used**: faltou ativar a API (passo 1.3).
- **invalid_grant / JSON**: o conteúdo do `.json` não foi colado inteiro.

## Como funciona

- Upload pelo sistema → vai direto para a pasta do cliente no Drive (vídeos grandes em partes, retomando se a conexão cair).
- Edição (corte, exportação, legenda, peça) → o servidor baixa o arquivo, processa e devolve o resultado ao Drive.
- Excluir no sistema → o arquivo vai para a **lixeira do Drive** (recuperável por 30 dias).
- O banco do sistema é copiado para `_sistema/` a cada minuto com mudanças, mais uma cópia por dia.
  Se o servidor reiniciar sem disco, ele restaura sozinho a cópia mais recente.
- Arquivos colocados **direto no Drive** (fora do sistema) não aparecem automaticamente no Spec Studio;
  envie pelo sistema para que entrem na biblioteca.
