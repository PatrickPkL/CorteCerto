# Plano de Resposta a Incidentes — Corte Certo

## 1. Definição de Incidente

Um incidente de segurança é qualquer evento que comprometa a confidencialidade, integridade ou disponibilidade de dados pessoais tratados pelo Corte Certo, incluindo:

- Acesso não autorizado a dados pessoais
- Vazamento de dados (e-mail, telefone, dados de pagamento)
- Perda ou destruição não intencional de dados
- Ataque cibernético que afete dados de titulares
- Falha de segurança em integrações de terceiros que tratam dados

## 2. Classificação de Severidade

| Nível | Descrição | Exemplo | Prazo de Resposta |
|-------|-----------|---------|-------------------|
| **Crítico** | Vazamento de dados pessoais em larga escala | Exposição de base de dados de usuários | 2 dias úteis |
| **Alto** | Acesso não autorizado a dados sensíveis | Conta de admin comprometida | 5 dias úteis |
| **Médio** | Tentativa de ataque sem confirmação de vazamento | Tentativa de SQL injection bloqueada | 10 dias úteis |
| **Baixo** | Falha de segurança sem risco aos dados | Bug de interface sem exposição de dados | 30 dias úteis |

## 3. Equipe de Resposta

| Papel | Responsável | Contato |
|-------|-------------|---------|
| **DPO** | Responsável designado | dpo@cortecerto.com |
| **Técnico** | Desenvolvedor principal | Canal interno |
| **Comunicação** | DPO | dpo@cortecerto.com |

## 4. Procedimento de Resposta

### 4.1 Detecção e Contenção (0-24 horas)
1. Identificar a natureza e escala do incidente
2. Conter o incidente (bloquear acesso, revogar tokens, fechar endpoints)
3. Preservar evidências (logs, backups do banco de dados)
4. Classificar a severidade

### 4.2 Avaliação (24-48 horas)
1. Determinar quais dados foram afetados
2. Identificar titulares impactados
3. Avaliar risco concreto aos titulares
4. Documentar achados

### 4.3 Notificação à ANPD (até 2 dias úteis para incidentes críticos)
Notificação deve conter:
- Descrição da natureza do incidente
- Categorias e número aproximado de titulares afetados
- Dados pessoais envolvidos
- Medidas de contenção adotadas
- Riscos aos titulares
- Medidas de mitigação implementadas ou propostas

### 4.4 Notificação aos Titulares (até 15 dias úteis)
1. Notificar titulares afetados via e-mail
2. Informar natureza do incidente
3. Dados afetados
4. Medidas de proteção disponíveis
5. Contato do DPO para esclarecimentos

### 4.5 Remediação (até 30 dias)
1. Implementar correções definitivas
2. Atualizar procedimentos de segurança
3. Realizar análise pós-incidente
4. Documentar lições aprendidas

## 5. Template de Notificação à ANPD

```
NOTIFICAÇÃO DE INCIDENTE DE SEGURANÇA — ANPD

1. Controlador: [Nome da empresa / Corte Certo]
2. DPO Responsável: [Nome] — dpo@cortecerto.com
3. Data do incidente: [DD/MM/AAAA]
4. Data da notificação: [DD/MM/AAAA]
5. Natureza do incidente: [Descrição breve]
6. Categorias de dados afetados: [Ex: e-mail, telefone, nome]
7. Número aproximado de titulares: [Quantidade]
8. Medidas de contenção: [Descrição]
9. Riscos estimados: [Descrição]
10. Medidas de mitigação: [Descrição]
```

## 6. Registro de Incidentes

Todo incidente deve ser registrado com:
- Data/hora da detecção
- Descrição do incidente
- Classificação de severidade
- Ações tomadas
- Resultado final
- Data de fechamento
