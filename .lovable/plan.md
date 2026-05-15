I will restore and enhance the "Gestão Financeira" feature, ensuring it is visible to both Admins and Pizzeria Owners with appropriate data access and a professional interface.

### Technical Steps

#### 1. Database Enhancements (Migration)
*   **Update Views**: Modify `pizzeria_financial_metrics` to include:
    *   `last_order_at`: Most recent order timestamp (excluding cancelled).
    *   `status`: Current status of the pizzeria.
*   **Create/Update RPCs**:
    *   `get_financial_dashboard_data`: A comprehensive function to return metrics based on selected date ranges and filters.
    *   Ensure all functions use `America/Sao_Paulo` timezone and exclude cancelled orders.

#### 2. Navigation Sidebar
*   Verify and ensure "Gestão Financeira" is correctly listed in `src/routes/_app.tsx` for all authenticated users.
*   Adjust icons and labels to match the premium look.

#### 3. Finance Page Implementation (`src/routes/_app/finance.tsx`)
*   **Dynamic View Switching**:
    *   **Admin Mode**: Global metrics cards (Today/Week/Month totals), "Desempenho por Pizzaria" table with multi-period columns, and Ranking section.
    *   **Owner Mode**: Personalized metrics cards (Today/Week/Month totals) and "Resumo da Pizzaria" section.
*   **Advanced Filtering**:
    *   Implementation of "Hoje", "Esta Semana", "Este Mês", "Últimos 7 dias", "Últimos 30 dias", and "Período Personalizado".
    *   Admin filter to select a specific pizzeria.
*   **UI/UX**:
    *   Modern dark-themed cards with Lucide icons.
    *   Brazil Real (R$) formatting.
    *   Loading and empty states with clear messaging.
    *   Responsive layout for mobile and desktop.

### Verification Plan
*   **Visual Check**: Confirm "Gestão Financeira" appears in the sidebar.
*   **Admin Test**: Verify global totals and the performance table show data from all pizzerias.
*   **Owner Test**: Verify owners only see their own metrics and cannot select other pizzerias.
*   **Logic Check**: Confirm cancelled orders are excluded from totals and timezone is correct.
