# Inventário de Dados Pessoais — Corte Certo

## 1. Visão Geral

Este inventário mapeia todos os dados pessoais tratados pelo Corte Certo, incluindo localização de armazenamento, finalidade, prazo de retenção e acesso.

## 2. Dados por Categoria

### 2.1 Dados de Identificação

| Campo | Tabela | Tipo | Criptografia | Finalidade |
|-------|--------|------|--------------|------------|
| id | users | INTEGER | — | Identificador único |
| name | users | TEXT | Não | Identificação entre usuários |
| email | users | TEXT | AES-256-GCM | Autenticação, notificações |
| phone | users | TEXT | AES-256-GCM | Login SMS, notificações |
| role | users | TEXT | Não | Controle de acesso (cliente/dono) |
| created_at | users | TEXT (ISO) | Não | Registro temporal |

### 2.2 Consentimentos

| Campo | Tabela | Tipo | Criptografia | Finalidade |
|-------|--------|------|--------------|------------|
| consentimentos[] | users | ARRAY | Não | Registro de aceites LGPD |

### 2.3 Dados de Autenticação

| Campo | Tabela | Tipo | Criptografia | Finalidade |
|-------|--------|------|--------------|------------|
| token | sessions | TEXT | Não | Sessão autenticada |
| user_id | sessions | INTEGER | Não | Relação com titular |
| expires_at | sessions | TEXT (ISO) | Não | Expiração automática |
| code | sms_codes | TEXT | Não | Verificação 2FA |
| used | magic_tokens | INTEGER | Não | Controle de uso |

### 2.4 Dados de Agendamento

| Campo | Tabela | Tipo | Criptografia | Finalidade |
|-------|--------|------|--------------|------------|
| user_id | appointments | INTEGER | Não | Cliente |
| barbershop_id | appointments | INTEGER | Não | Estabelecimento |
| professional_id | appointments | INTEGER | Não | Profissional |
| date, time | appointments | TEXT | Não | Horário |
| status | appointments | TEXT | Não | Estado do agendamento |

### 2.5 Dados Financeiros (Obrigação Legal)

| Campo | Tabela | Tipo | Criptografia | Prazo |
|-------|--------|------|--------------|-------|
| barbershop_id | subscriptions | INTEGER | Não | 5 anos |
| status, plan_id | subscriptions | INTEGER | Não | 5 anos |
| amount | payments | REAL | Não | 5 anos |
| status | payments | TEXT | Não | 5 anos |

### 2.6 Logs de Auditoria

| Campo | Tabela | Tipo | Criptografia | Prazo |
|-------|--------|------|--------------|-------|
| acao | audit_log | TEXT | Não | 6 meses |
| user_id | audit_log | INTEGER | Não | 6 meses |
| ip | audit_log | TEXT | Não | 6 meses |
| timestamp | audit_log | TEXT (ISO) | Não | 6 meses |

## 3. Fluxo de Dados

```
Usuário → App (HTTP) → Server Node.js → DB JSON (local)
   ↓                                          ↓
 SMS (Zenvia)                         Criptografia AES
 Email (Gmail SMTP)                   antes de salvar
```

### Compartilhamento
| Destinatário | Dados | Finalidade | Base Legal |
|-------------|-------|------------|------------|
| Profissional da barbearia | Nome do cliente, dados do agendamento | Execução do serviço | Execução de contrato |
| Zenvia (SMS) | Telefone, código | Autenticação | Execução de contrato |
| Google (Nominatim) | Coordenadas (reversa) | Geocodificação de endereço | Legítimo interesse |

## 4. Acesso

| Perfil | Acesso | Restrição |
|--------|--------|-----------|
| Cliente | Próprios dados | — |
| Dono | Dados da própria loja + clientes | Apenas loja own |
| Super-admin | Todos os dados | Apenas com autenticação + IP |

## 5. Retenção e Exclusão

| Tipo de Dado | Retenção | Ao Excluir Conta |
|-------------|----------|-------------------|
| Dados pessoais | Conta ativa + 15 dias | Anonimizados ([REMOVIDO]) |
| Agendamentos | 5 anos | Mantidos (anônimos) |
| Pagamentos | 5 anos | Mantidos (obrigação fiscal) |
| Sessões | 7 dias (TTL) | Removidos imediatamente |
| Logs | 6 meses | Mantidos (anônimos) |
| Notificações | Removidas ao ler | Removidas |
| Favoritos | Conta ativa | Removidos |
