# Finance HQ

A private dashboard and thinking space for your money. Open `index.html` in a browser. No install, no account, no server.

## What's inside

- **Dashboard**: net worth, this month's net, savings rate YTD, cash runway, 12-month cash flow, net worth history, spending by category, asset allocation, goal progress and a "Needs attention" list that flags runway gaps, savings rate drops, category spikes, concentration and goals falling behind.
- **Income**: every income stream grouped into Interests, Cash cows, Dividends and Deal building, entered month by month against a MXN 5.5M monthly goal. Shows growth, projected month to reach the goal, the growth rate needed by a target date, recurring vs one-off share, a stream pipeline (Live, Building, Idea, Paused) and how each month's income is distributed (BBVA salary, TRF daily, Fácil card, cash, Regina, PR). On claude.ai you can upload photos or screenshots of statements and Claude proposes the entries for you to confirm.
- **Transactions**: log spending or import a bank CSV (`date, description, amount, category`, negative = spending).
- **Investments & Accounts**: cash, brokerage, retirement, private/angel, real estate, crypto and debt, with cost basis and unrealized gains. Take a snapshot each month to build net worth history.
- **Goals**: target, deadline, monthly plan and the reason it matters. Link a goal to an account and progress updates itself.
- **Second Brain**: principles, decisions, lessons, ideas and monthly reviews, all searchable and tagged. Decisions run through a five-lens advisory council (Contrarian, First principles, Expansionist, Outsider, Executor) and carry an amount at stake, confidence and a review date. The monthly review template pre-fills last month's numbers.

## Structure (current)

- **Dashboard**: 1 Income, 2 Income vs goal (MXN 5.5M total, 1.5M interest), 3 Expenses, 4 Expenses vs budget, 5 Saved & reinvested.
- **Income**: streams by group, entered per month.
- **Allocation**: the monthly plan of where income is sent (BBVA salaries, TRF cards, cash, payments, operating costs) and what was actually sent.
- **Expenses**: each expense logged as it arrives with who was paid, which account paid it and a category.
- **Savings**: what is left after expenses in Loggia, BBVA and Saldo, and how much of it was reinvested.
- Goals, Journal and Settings sit in the secondary menu.

## Privacy

Everything is stored in your browser's localStorage. Nothing leaves your machine. Use **Settings > Export JSON backup** regularly, since clearing browser data erases it.

The first visit loads sample data so you can see how it works. Erase it in Settings.

## Monthly ritual (15 minutes)

1. Import or log last month's transactions.
2. Update account values, take a net worth snapshot.
3. Open Second Brain, click **Start monthly review**, answer the prompts.
4. Revisit any decision whose review date has passed.
