# Follow Your Money - Advanced Bitcoin Transaction Tracer

**(Placeholder: Immagine Principale dell'App - es. lo screenshot completo che mi hai mostrato di recente)**
*`![Follow Your Money - Main Interface](path/to/your/main_app_screenshot.png)`*

**Follow Your Money** is a web application designed to help users trace the path of Bitcoin funds, visualize transaction flows, and identify potential behavioral patterns that might be associated with illicit activities or common scamming techniques. This tool empowers users to gain insights into how their (or other) Bitcoin funds have moved across the blockchain.

## Core Strengths & Features

*   📊 **Interactive Graph Visualization:** Dynamically renders the flow of Bitcoin between addresses (wallets) and transactions using Vis.js. This provides a clear visual map of fund movements.
    *   **(Placeholder: Immagine del Grafico in Azione - magari con un tracciamento multi-livello)**
        *`![Interactive Graph](path/to/your/graph_screenshot.png)`*
*   🔍 **Multi-Level Tracing:** Users can click on any node (address or transaction) in the graph to expand the trace, fetching and displaying connected transactions and addresses further down the chain.
*   💡 **Behavioral Pattern Detection (Heuristic):** The application analyzes transaction history for the searched address to identify simple, common patterns that *could* be indicative of certain activities. These include:
    *   **Rapid Influx from Multiple Sources:** Detects if an address quickly receives numerous small payments from many different sender addresses.
    *   **Consolidation/Fragmentation Activity:** Identifies instances where funds are either gathered from many inputs into fewer outputs, or split from few inputs into many outputs.
    *   **Dusting Activity:** Flags the reception of multiple, extremely small "dust" amounts.
    *   **(Placeholder: Immagine della Sezione "Behavioral Patterns Observed")**
        *`![Behavioral Patterns Section](path/to/your/patterns_screenshot.png)`*
    *   *A detailed explanation of these patterns and their potential implications can be found in `PATTERNS_AND_SCAMS.md`.* (Link al file separato)
*   📋 **Address Summary:** For a searched address, the app displays:
    *   Confirmed Balance
    *   Total Received
    *   Direct links for manual verification on [Chainabuse](https://chainabuse.com) and [Arkham Intelligence](https://platform.arkhamintelligence.com).
*   📜 **Recent Transactions List:** Shows the last 10 transactions associated with a searched address, clearly indicating:
    *   Direction (Incoming 🟢 / Outgoing 🔴)
    *   Timestamp
    *   Amount
    *   Counterparty addresses (simplified)
    *   A direct link to the transaction on Mempool.space.
    *   **(Placeholder: Immagine della Tabella "Recent Transactions")**
        *`![Recent Transactions List](path/to/your/transactions_list_screenshot.png)`*
*   🛠️ **User Controls & Export:**
    *   **Reset Graph View:** Reverts the graph to its initial state for the current search.
    *   **Reset All:** Clears all results and prepares for a new search.
    *   **Toggle Fullscreen:** View the transaction graph in fullscreen mode.
    *   **Data Export:** Export graph data (JSON) and recent transactions (CSV).
*   📖 **Clear Legend:** Explains all visual cues used in the graph and transaction list, including the behavioral patterns.

## How It Works

The application takes a Bitcoin address or a Transaction ID (TXID) as input.
1.  The **Node.js/Express backend** fetches blockchain data primarily from the **Mempool.space API**.
2.  It processes this data to:
    *   Construct the initial graph structure (nodes and edges).
    *   Calculate address summaries (balance, total received).
    *   Compile a list of recent transactions.
    *   Analyze the transaction history for the defined behavioral patterns using simple heuristics.
3.  The **frontend (Vanilla JavaScript, HTML, CSS)** receives the processed data and:
    *   Renders the interactive graph using **Vis.js Network**.
    *   Displays all informational sections (Summary, Recent Transactions, Behavioral Patterns, Legend).
    *   Handles user interactions for multi-level graph tracing, resets, fullscreen mode, and data exports.

## Technologies Used

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript, Vis.js
*   **Backend:** Node.js, Express.js, Axios
*   **Primary Data Source:** Mempool.space API

## Setup and Local Usage

To run this application locally:

1.  **Prerequisites:**
    *   Node.js (v14.x or later recommended) and npm (or yarn).
2.  **Clone the Repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/follow-your-money.git
    cd follow-your-money
    ```
3.  **Install Dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```
4.  **Environment Variables (Optional):**
    *   While the application currently does not strictly require API keys for its core functionality (Chainabuse check is a manual link), a `.env.example` file is provided. If you plan to integrate services requiring API keys in the future, copy it to `.env`:
        ```bash
        cp .env.example .env
        ```
    *   Then, add your keys to the `.env` file.
    *   **Important:** Ensure `.env` is in your `.gitignore` file.
4.  **Run the Server:**
    ```bash
    node server.js
    ```
5.  **Access the Application:**
    Open your web browser and navigate to `http://localhost:3000` (or the port configured in `server.js`).

## Usage Guide

1.  Enter a Bitcoin address or TXID into the input field.
2.  Click "Trace".
3.  Analyze the "Summary" for balance details and links to Chainabuse/Arkham.
4.  Review "Behavioral Patterns Observed". If patterns are detected, consider their implications (see `PATTERNS_AND_SCAMS.md`) and use the provided Chainabuse link for community reports.
5.  Explore the interactive "Graph". Click on nodes to trace further.
6.  Examine the "Recent Transactions" list.
7.  Use "Export" buttons if you need to save data.
8.  Use "Reset Graph View" to simplify an expanded graph or "Reset" to start over.
9.  Consult the "Legend" for visual cues.

## Important Disclaimer

*   **Experimental Tool:** "Follow Your Money" is an experimental tool provided for informational and educational purposes only.
*   **No Guarantees:** Tracing transactions does not guarantee the recovery of funds or the definitive identification of illicit activity.
*   **Data Accuracy:** Information relies on public blockchain data (via Mempool.space) and external services. While efforts are made for accuracy, data may not always be complete, error-free, or up-to-date. Always perform your own due diligence.
*   **Anonymity:** Identifying the real-world owner of a Bitcoin address is generally not possible with this tool alone.
*   **Balance Information:** Displayed balances refer to specific addresses and may not represent an entity's total holdings (wallet balance).
*   **Behavioral Patterns:** Any patterns identified are based on **simple heuristics**. These are observations, **not proof of illicit activity**. They can generate false positives. Always conduct thorough due diligence and consider multiple factors.
*   **Use Responsibly:** Use this tool ethically and responsibly.

## Understanding Behavioral Patterns and Scam Techniques

For a more detailed explanation of the behavioral patterns this tool attempts to identify, and how they might relate to common scam techniques, please see the **[`PATTERNS_AND_SCAMS.md`](PATTERNS_AND_SCAMS.md)** file in this repository.

## Contributing

Contributions, bug reports, and feature requests are welcome! Please open an issue or submit a pull request.
