# API do Nexo Assist

## Decisões

O barramento de eventos de conversa opera em memória, em uma única instância da API. Antes de rodar mais de uma réplica, troque o adaptador por um barramento compartilhado com PostgreSQL `LISTEN/NOTIFY` para entregar eventos aos assinantes SSE conectados a qualquer réplica.
