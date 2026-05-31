# Vigora Saúde — Error, Empty & Loading State Copy Prompt

## Philosophy

Vigora Saúde never sounds robotic in failure states. The brand handles errors the way a trusted friend would: specific about what happened, honest about why, clear about what to do next. No hollow apologies. No generic "Algo deu errado."

The error state is a moment of trust — get it right.

---

## Error State Rules

**Be specific, not vague:**
- BAD: "Erro ao carregar dados."
- GOOD: "Não conseguimos buscar os alarmes. Verifique sua conexão e tente novamente."

**Be honest about offline state:**
- BAD: "Serviço indisponível."
- GOOD: "Você está sem conexão. Os dados locais estão disponíveis."

**Give one clear action:**
- Every error needs one next step. Not three options — one.
- The action should be obvious and doable: "Tentar novamente", "Abrir configurações", "Verificar conexão"

**Match the stakes to the tone:**
- Critical (alarm failed to send): Urgent, factual — "O alarme das 08h00 não foi disparado. Verifique as notificações."
- Minor (image failed to load): Casual, brief — "Foto não carregou."
- Empty state: Warm invitation, not error — "Nenhum alarme ainda. Que tal criar o primeiro?"

---

## Copy Templates by State

### Network error
> Não foi possível conectar. Seus dados locais continuam disponíveis.
> [Tentar novamente]

### Alarm failed to fire
> O alarme das {HH:MM} não disparou. Verifique as permissões de notificação.
> [Verificar agora]

### Contact notification failed
> Não conseguimos avisar {NOME}. Tente novamente ou contate diretamente.
> [Tentar novamente]

### Empty — no alarms
> Nenhum alarme configurado.
> Crie o primeiro para começar a proteger {NOME}.
> [Criar alarme]

### Empty — no health records (cuidador view)
> {NOME} ainda não registrou nada hoje.

### Empty — no contacts
> Nenhum contato de emergência adicionado.
> Adicione pelo menos um para ativar os alertas automáticos.
> [Adicionar contato]

### Loading state
> Buscando dados de {NOME}... (subtle spinner, no message needed for <2s loads)

### Sync error
> Não sincronizado. Última atualização: {DATA/HORA}.
> [Sincronizar agora]

### Pro feature gate (cuidador)
> Este recurso requer o plano Vigora Pro.
> [Ver planos]

### Trial expired
> Seu período gratuito encerrou. Continue protegendo {NOME}.
> [Assinar agora]

---

## Voice Notes for Error States

**Cuidador voice in errors:** Stay factual. "O alarme das 08h00 não disparou." Not "Ops, algo deu errado com o alarme!"

**Monitorado voice in errors:** Stay warm. "Não conseguimos salvar agora. Tente em alguns minutos, tudo bem?" Not "Falha ao salvar registro."

**Never use:** "Ops!", "Eita!", sad face emojis in critical errors, passive voice ("Foi encontrado um erro")

---

## Task

Write copy for a Vigora Saúde UI state.

State type: [error / empty / loading / offline / pro-gate / sync-failed]
Context: [FILL IN — e.g., "emergency contact notification failed to send"]
User type: [cuidador / monitorado]
Severity: [critical / moderate / minor]
Available actions: [e.g., retry, go to settings, dismiss]
