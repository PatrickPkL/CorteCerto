# Relatório de Impacto à Proteção de Dados Pessoais (RIPD) — Corte Certo

## 1. Identificação do Controlador

| Campo | Valor |
|-------|-------|
| **Nome** | Corte Certo |
| **DPO** | dpo@cortecerto.com |
| **Data do RIPD** | 26/08/2026 |
| **Versão** | 1.0 |

## 2. Descrição do Tratamento

O Corte Certo é uma plataforma de conexão entre clientes e barbearias/salões de beleza, facilitando o agendamento de serviços.

**Operações de tratamento:**
- Cadastro de usuários (clientes e donos de estabelecimentos)
- Autenticação via código SMS e link mágico por e-mail
- Agendamento e gestão de compromissos
- Notificações e lembretes
- Geolocalização para busca de estabelecimentos próximos
- Gestão de assinatura e cobrança
- Avaliações de estabelecimentos

## 3. Base Legal

| Tratamento | Base Legal | Art. 7º LGPD |
|------------|-----------|---------------|
| Criação de conta | Execução de contrato | V |
| Autenticação | Execução de contrato | V |
| Agendamentos | Execução de contrato | V |
| Notificações de agendamento | Legítimo interesse | IX |
| Geolocalização | Consentimento | I |
| Dados financeiros | Obrigação legal/regulatória | II |
| Logs de acesso | Legítimo interesse | IX |
| Avaliações | Consentimento | I |

## 4. Dados Tratados

| Dado | Sensível? | Criptografado | Finalidade | Prazo |
|------|-----------|---------------|------------|-------|
| Nome | Não | Não (buscável) | Identificação | Conta ativa + 15 dias |
| Telefone | Não | Sim (AES-256-GCM) | Login SMS + notificações | Conta ativa + 15 dias |
| E-mail | Não | Sim (AES-256-GCM) | Notificações + link mágico | Conta ativa + 15 dias |
| Localização | Não | Não (não persistente) | Busca de barbearias próximas | Sessão apenas |
| Agendamentos | Não | Não | Histórico | 5 anos |
| Pagamentos | Não | Não | Obrigação fiscal | 5 anos |
| Logs de acesso | Não | Não | Auditoria | 6 meses |

## 5. Riscos Identificados

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Vazamento de base de dados | Baixa | Alto | Criptografia em repouso, acesso restrito |
| Acesso indevido por admin | Baixa | Alto | Logs de auditoria, controle de acesso |
| Interceptação de dados em trânsito | Baixa | Alto | HTTPS em produção |
| Perda de dados | Baixa | Médio | Backup diário, persistência em disco |
| Uso indevido por terceiros | Baixa | Médio | Sem compartilhamento com terceiros |

## 6. Medidas de Mitigação

### Técnicas
- Criptografia AES-256-GCM para telefone e e-mail em repouso
- Comunicação HTTPS
- Tokens de sessão com expiração (7 dias)
- Limite de sessões simultâneas (5)
- Logs de auditoria para ações sensíveis
- Validação de entrada em todas as APIs

### Organizacionais
- Política de privacidade pública
- Termos de uso com aceite explícito
- DPO designado com canal de contato
- Processo de resposta a incidentes documentado
- Procedimento de exclusão com anonimização

## 7. Conclusão

O Corte Certo adota medidas técnicas e organizacionais adequadas ao risco, em conformidade com os princípios da LGPD (Art. 6º). Os riscos residuais são considerados aceitáveis. Este RIPD será revisado semestralmente ou a cada alteração significativa no tratamento de dados.
