# Implementação de Dashboards Administrativos Funcionais

Este plano substitui os placeholders nas abas do Painel Admin por dashboards conectados a dados reais do Supabase com suporte a atualizações em tempo real.

## 1. Infraestrutura de Dados
- Utilizar `useQuery` do `@tanstack/react-query` para busca de dados com cache e revalidação.
- Implementar assinaturas do Supabase Realtime (`.on('postgres_changes')`) dentro de hooks customizados para cada dashboard, garantindo que o UI reflita mudanças no banco instantaneamente.

## 2. Implementação das Abas (Dashboards)

### FlyPizzarias
- Listagem completa com busca, filtragem por status, ordenação.
- Ações rápidas: Acessar Painel, Cardápio, Ativar/Desativar, Suspender.
- Métricas em tempo real: pedidos hoje, receita hoje.

### Insights Globais
- Cartões de resumo: Total lojas, ativas, inativas, pedidos hoje/7dias.
- Gráficos com `recharts`: Pedidos diários, distribuição de pedidos por pizzaria, status de lojas.

### Financeiro Global
- Resumo financeiro consolidado: Faturamento bruto, ticket médio, total de pedidos.
- Tabela de ranking por pizzaria com filtros de período (Hoje, 7d, este mês).
- Exclusão inteligente de pedidos demo/cancelados.

### Usuários
- Tabela de usuários com e-mail, função e vínculo.
- Ações: Editar permissões, desativar/reativar conta.

### Clientes e Planos
- Controle comercial de assinaturas.
- Exibição de plano, vencimento, dias para expirar.
- Ações de suspensão/reativação.

## 3. Qualidade e Segurança
- Implementação de estados de `loading` (Skeleton screens) e estados vazios amigáveis.
- Verificação de acesso (`admin_only`) em todas as rotas/componentes administrativos.
- Garantia de não contaminação de dados (pedidos teste/demo filtrados no financeiro por padrão).
- Reuso de componentes de UI (`Table`, `Card`, `Button`, `Badge`) para consistência.

## Cronograma
1. Criar hooks de dados e subscrições realtime.
2. Implementar `FlyPizzarias`.
3. Implementar `Insights`.
4. Implementar `Financeiro`.
5. Implementar `Usuários` e `Assinaturas`.
6. Validação e testes de estados vazios/erro/loading.
