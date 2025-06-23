// Load environment variables from .env file
require('dotenv').config();
// --- DEBUG --- Log value immediately after dotenv load
// console.log('--- DEBUG: Value of CHAINABUSE_API_KEY right after dotenv.config():', process.env.CHAINABUSE_API_KEY); // Chainabuse removed

// 1. Import Express and Axios
const express = require('express');
const path = require('path'); // Import the path module
const axios = require('axios'); // Import Axios

// 2. Create an Express app instance
const app = express();

// 3. Define the port
const PORT = process.env.PORT || 3000;

// 4. Middleware to serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// 5. Middleware to parse JSON request bodies
app.use(express.json());

// 6. Define a basic GET route for '/'
app.get('/', (req, res) => {
  res.send('Follow Your Money Backend Active');
});

// Removed checkChainabuse function as it's no longer used.

// --- Helper Functions ---

// Hardcoded map for basic exchange identification (VERY limited)
const KNOWN_EXCHANGES = {
  // Add known exchange addresses/prefixes here
  // Example format: 'address_or_prefix': 'Exchange Name'
  'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97': 'Binance (Example Hot Wallet)',
  // Add more known addresses...
};

// Renamed Function: Get address stats (including total received) from Mempool.space
async function getAddressStats(address) {
  // Log address at start
  console.log('[getAddressStats] Fetching stats for:', address);
  const mempoolUrl = `https://mempool.space/api/address/${address}`;
  // Log URL
  console.log('[getAddressStats] Calling URL:', mempoolUrl);
  try {
    const response = await axios.get(mempoolUrl);
    // Log raw response data
    console.log('[getAddressStats] Raw API Response data for', address, ':', JSON.stringify(response.data, null, 2));
    const stats = response.data?.chain_stats;
    if (stats) {
      // Extract total funded amount (total received)
      // Extract total funded amount (total received)
      const fundedSum = stats.funded_txo_sum || 0; // Default to 0
      // Step 1: Log raw funded_txo_sum
      console.log('[getAddressStats] Raw funded_txo_sum:', fundedSum);
      const totalReceivedSat = fundedSum;
      console.log('[getAddressStats] Total Received (Satoshis) to be returned:', totalReceivedSat);
      // Return the total received amount in Satoshis
      return totalReceivedSat;
    }
    console.log('[getAddressStats] No chain_stats found in response for:', address);
    return null; // Indicate stats couldn't be determined
  } catch (error) {
    // Log detailed error in catch
    console.error('[getAddressStats] Error fetching stats for', address, ':', error.message);
    if (error.response) {
        console.error('[getAddressStats] Error Response Status:', error.response.status);
        console.error('[getAddressStats] Error Response Data:', JSON.stringify(error.response.data, null, 2));
        if (error.response.status === 400) {
            console.log(`[getAddressStats] Mempool returned 400 for address ${address}, likely invalid format or not found.`);
        }
    } else if (error.request) {
        console.error('[getAddressStats] Error Request:', error.request);
    }
    return null; // Indicate error or address not found
  }
}

// --- Behavioral Analysis Helper Functions ---

// 2. Function to Detect "High Number of Transactions in Short Time"
function analyzeHighTransactionVolume(transactions, timeWindowHours = 24) {
    const now = Date.now();
    const timeWindowMs = timeWindowHours * 60 * 60 * 1000;
    let count = 0;

    transactions.forEach(tx => {
        if (tx.status && tx.status.confirmed && tx.status.block_time) {
            const txTime = tx.status.block_time * 1000; // Convert to ms
            if (now - txTime <= timeWindowMs) {
                count++;
            }
        }
    });

    const threshold = 20; // Example: > 20 transactions in 24 hours
    if (count > threshold) {
        return {
            detected: true,
            count: count,
            windowHours: timeWindowHours,
            threshold: threshold
        };
    }
    return { detected: false };
}

// 3. Function to Detect "Input vs Output" (Simple Consolidation/Fragmentation)
function analyzeConsolidationFragmentation(transactions, targetAddress) {
    let consolidationEvents = 0;
    let fragmentationEvents = 0;
    const uniqueIoThreshold = 5; // Example: > 5 unique inputs/outputs

    transactions.forEach(tx => {
        let isOutputForTarget = tx.vout.some(vout => vout.scriptpubkey_address === targetAddress);
        if (isOutputForTarget) {
            const distinctInputs = new Set();
            tx.vin.forEach(vin => {
                if (vin.prevout && vin.prevout.scriptpubkey_address && vin.prevout.scriptpubkey_address !== targetAddress) {
                    distinctInputs.add(vin.prevout.scriptpubkey_address);
                }
            });
            if (distinctInputs.size >= uniqueIoThreshold) {
                consolidationEvents++;
            }
        }

        let isInputFromTarget = tx.vin.some(vin => vin.prevout && vin.prevout.scriptpubkey_address === targetAddress);
        if (isInputFromTarget) {
            const distinctOutputs = new Set();
            tx.vout.forEach(vout => {
                if (vout.scriptpubkey_address && vout.scriptpubkey_address !== targetAddress) {
                    distinctOutputs.add(vout.scriptpubkey_address);
                }
            });
            if (distinctOutputs.size >= uniqueIoThreshold) {
                fragmentationEvents++;
            }
        }
    });

    const detected = consolidationEvents > 0 || fragmentationEvents > 0;
    if (detected) {
        return {
            consolidationDetected: consolidationEvents > 0,
            fragmentationDetected: fragmentationEvents > 0,
            consolidationEvents,
            fragmentationEvents,
            uniqueIoThreshold,
            details: `Consolidation events (>=${uniqueIoThreshold} unique inputs to target): ${consolidationEvents}. Fragmentation events (>=${uniqueIoThreshold} unique outputs from target): ${fragmentationEvents}.`
        };
    }
    return { consolidationDetected: false, fragmentationDetected: false, uniqueIoThreshold };
}


// 4. Function to Detect "Dust Amounts" (Simple Dusting)
function analyzeDusting(transactions, targetAddress) {
    let dustTransactionCount = 0;
    const dustThresholdSat = 1000; // Example: < 1000 satoshis
    const minDustTransactions = 5; // Example: > 5 dust transactions

    transactions.forEach(tx => {
        tx.vout.forEach(vout => {
            if (vout.scriptpubkey_address === targetAddress && vout.value < dustThresholdSat && vout.value > 0) {
                dustTransactionCount++;
            }
        });
    });

    if (dustTransactionCount >= minDustTransactions) {
        return {
            detected: true,
            count: dustTransactionCount,
            dustThresholdSat: dustThresholdSat,
            minTransactionsRequired: minDustTransactions
        };
    }
    return { detected: false };
}

// 5. Function to Detect "Rapid Influx from Multiple Sources"
function analyzeRapidInflux(transactions, targetAddress, timeWindowMinutes = 60, minTxCount = 5, minUniqueSenders = 3) {
    console.log(`[analyzeRapidInflux] Analyzing address: ${targetAddress}`);
    console.log(`[analyzeRapidInflux] Received ${transactions ? transactions.length : 0} transactions to analyze.`);
    console.log(`[analyzeRapidInflux] Parameters: timeWindowMinutes=${timeWindowMinutes}, minTxCount=${minTxCount}, minUniqueSenders=${minUniqueSenders}`);

    if (!transactions || transactions.length === 0) {
        console.log("[analyzeRapidInflux] No transactions to analyze, exiting.");
        return { detected: false };
    }

    const timeWindowMs = timeWindowMinutes * 60 * 1000;
    
    let latestTxTimestamp = 0;
    transactions.forEach(tx => {
        if (tx.status && tx.status.confirmed && tx.status.block_time) {
            const currentTxTimestamp = tx.status.block_time * 1000;
            if (currentTxTimestamp > latestTxTimestamp) {
                latestTxTimestamp = currentTxTimestamp;
            }
        }
    });
    
    const referenceTimestamp = latestTxTimestamp > 0 ? latestTxTimestamp : Date.now();
    console.log(`[analyzeRapidInflux] Reference timestamp for window: ${new Date(referenceTimestamp).toISOString()} (${referenceTimestamp})`);
    const windowStartTime = referenceTimestamp - timeWindowMs;
    console.log(`[analyzeRapidInflux] Window start time: ${new Date(windowStartTime).toISOString()} (${windowStartTime})`);

    const timeFilteredTransactions = transactions.filter(tx => {
        const txTime = (tx.status && tx.status.confirmed && tx.status.block_time) ? tx.status.block_time * 1000 : Date.now(); // Unconfirmed are "now"
        return txTime >= windowStartTime && txTime <= referenceTimestamp;
    });
    console.log(`[analyzeRapidInflux] Found ${timeFilteredTransactions.length} transactions within the time window.`);
    if (timeFilteredTransactions.length > 0) {
        console.log(`[analyzeRapidInflux] Example time-filtered TXs (up to 3):`);
        timeFilteredTransactions.slice(0, 3).forEach((tx, index) => {
            const txTime = (tx.status && tx.status.confirmed && tx.status.block_time) ? tx.status.block_time * 1000 : "Unconfirmed (now)";
            const txTimestampStr = typeof txTime === 'number' ? new Date(txTime).toISOString() : txTime;
            console.log(`  TX ${index + 1}: ${tx.txid}, Time: ${txTimestampStr}`);
        });
    }

    const relevantIncomingTxsDetails = [];
    const allCollectedSenders = [];

    timeFilteredTransactions.forEach(tx => {
        let isIncoming = false;
        tx.vout.forEach(vout => {
            if (vout.scriptpubkey_address === targetAddress) {
                isIncoming = true;
            }
        });

        console.log(`[analyzeRapidInflux] Processing TX: ${tx.txid}, Is incoming to ${targetAddress}? ${isIncoming}`);

        if (isIncoming) {
            const currentTxSenders = [];
            tx.vin.forEach(vin => {
                if (vin.prevout && vin.prevout.scriptpubkey_address && vin.prevout.scriptpubkey_address !== targetAddress) {
                    currentTxSenders.push(vin.prevout.scriptpubkey_address);
                    allCollectedSenders.push(vin.prevout.scriptpubkey_address);
                }
            });
            if (currentTxSenders.length > 0) {
                 relevantIncomingTxsDetails.push({ txid: tx.txid, senders: currentTxSenders });
                 console.log(`[analyzeRapidInflux] TX ${tx.txid} is INCOMING. Senders collected: ${currentTxSenders.join(', ')}`);
            } else {
                 console.log(`[analyzeRapidInflux] TX ${tx.txid} is INCOMING but no external senders found (e.g., self-spend consolidation to target).`);
            }
        }
    });
    
    console.log(`[analyzeRapidInflux] All collected sender addresses (before unique): ${JSON.stringify(allCollectedSenders)}`);
    const uniqueSenders = new Set(allCollectedSenders);
    console.log(`[analyzeRapidInflux] Unique sender addresses: ${JSON.stringify(Array.from(uniqueSenders))}`);

    const relevantIncomingTxCount = relevantIncomingTxsDetails.length;
    const uniqueSendersCount = uniqueSenders.size;

    console.log(`[analyzeRapidInflux] Final check: relevantIncomingTxCount=${relevantIncomingTxCount} (min=${minTxCount}), uniqueSendersCount=${uniqueSendersCount} (min=${minUniqueSenders})`);

    if (relevantIncomingTxCount >= minTxCount && uniqueSendersCount >= minUniqueSenders) {
        const result = {
            detected: true,
            incomingTxCount: relevantIncomingTxCount,
            uniqueSendersCount: uniqueSendersCount,
            timeWindowMinutes: timeWindowMinutes
        };
        console.log('[analyzeRapidInflux] Result:', result);
        return result;
    }
    
    const result = { detected: false };
    console.log('[analyzeRapidInflux] Result:', result);
    return result;
}


// --- END Behavioral Analysis Helper Functions ---

// --- API Routes ---

// New API route to get transaction details (remains mostly the same)
app.get('/api/tx/:txid', async (req, res) => {
  const { txid } = req.params;
  const mempoolUrl = `https://mempool.space/api/tx/${txid}`;

  try {
    const response = await axios.get(mempoolUrl);
    res.json(response.data); // Send the transaction data back
  } catch (error) {
    console.error('Error fetching transaction data:', error.message);
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      res.status(error.response.status).send(`Error fetching transaction: ${error.response.data || error.response.statusText}`);
    } else if (error.request) {
      // The request was made but no response was received
      res.status(500).send('Error fetching transaction: No response from Mempool.space');
    } else {
      // Something happened in setting up the request that triggered an Error
      res.status(500).send(`Error fetching transaction: ${error.message}`);
    }
  }
});

// Refactored API route to trace and return data for Vis.js
app.get('/api/trace/:identifier', async (req, res) => {
  // Ensure identifier is declared first
  const { identifier } = req.params;
  // Step 5: Add Logging (Now uses the declared identifier)
  console.log(`\n--- Received trace request for identifier: ${identifier} ---`);
  const nodes = [];
  const edges = [];
  const nodeIds = new Set(); // Keep track of added nodes to avoid duplicates

  // Helper to add node if it doesn't exist
  const addNode = (node) => {
    if (!nodeIds.has(node.id)) {
      nodes.push(node);
      nodeIds.add(node.id);
    }
  };

  // Helper to format balance
  const formatBalance = (sats) => {
      if (sats === null || typeof sats === 'undefined') return 'N/A';
      return (sats / 100000000).toFixed(8) + ' BTC';
  };

  // Removed formatTimestamp helper, formatting will be done inline

  // Heuristic to distinguish TXID (64 hex chars) from Address
  const isTxid = /^[a-fA-F0-9]{64}$/.test(identifier);
  // Basic address check (can be improved)
  const isAddress = !isTxid && identifier.length >= 26 && identifier.length <= 62;

  // Step 4: Ensure route is wrapped in try...catch (already is)
  try {
    console.log(`Identifier type detected: ${isTxid ? 'TXID' : (isAddress ? 'Address' : 'Unknown')}`);
    if (isTxid) {
      // --- Handle TXID ---
      console.log(`[TXID Trace: ${identifier}] Fetching transaction details from Mempool...`);
      const mempoolUrl = `https://mempool.space/api/tx/${identifier}`;
      let txDetails;

      try {
        const mempoolResponse = await axios.get(mempoolUrl);
        txDetails = mempoolResponse.data;
        console.log(`[TXID Trace: ${identifier}] Mempool TX details fetched successfully.`);
      } catch (mempoolError) {
        console.error(`[TXID Trace: ${identifier}] Error fetching TXID details from Mempool:`, mempoolError.message);
        const status = mempoolError.response?.status || 500;
        const message = mempoolError.response?.data || mempoolError.response?.statusText || 'Failed to fetch transaction details';
        // Send JSON response for consistency
        return res.status(status).json({ message: `Mempool API error: ${message}`, error: mempoolError.message });
      }

      console.log(`[TXID Trace: ${identifier}] Adding TXID node.`);
      // Add the main TXID node
      addNode({
        id: txDetails.txid,
        label: `TX: ${txDetails.txid.substring(0, 8)}...`,
        title: `Transaction ID: ${txDetails.txid}\nFee: ${formatBalance(txDetails.fee)}\nStatus: ${txDetails.status?.confirmed ? 'Confirmed' : 'Unconfirmed'}`,
        type: 'transaction',
        shape: 'box',
        color: '#f0ad4e' // Orange for TX
      });

      // Process Inputs (vin) - Create edges from input addresses to TX
      console.log(`[TXID Trace: ${identifier}] Processing ${txDetails.vin.length} inputs...`);
      const inputAddressPromises = txDetails.vin.map(async (input) => {
        // For simplicity, we'll use the prevout address if available.
        // A full trace would require fetching the previous transaction.
        const prevout = input.prevout;
        if (prevout && prevout.scriptpubkey_address) {
          const inAddr = prevout.scriptpubkey_address;
          const inValue = prevout.value; // Value coming *from* this address in this TX

          addNode({
            id: inAddr,
            label: `${inAddr.substring(0, 6)}...${inAddr.substring(inAddr.length - 4)}`,
            title: `Address: ${inAddr}`,
            type: 'address',
            shape: 'dot',
            color: '#999999' // Grey for input addresses (less focus)
          });

          const edgeIdIn = `edge-in-${inAddr}-${txDetails.txid}`;
          edges.push({
            id: edgeIdIn,
            from: inAddr,
            to: txDetails.txid,
            label: formatBalance(inValue), // Amount spent from this address in this TX
            arrows: { to: { enabled: true, scaleFactor: 1, type: 'arrow' } },
            title: `Input: ${formatBalance(inValue)} from ${inAddr}`
          });
          console.log(`[TXID Trace: ${identifier}] Added input edge: ${edgeIdIn}`);
        }
      });
      await Promise.all(inputAddressPromises); // Wait for input processing if needed

      // Process Outputs (vout) - Create edges from TX to output addresses
      console.log(`[TXID Trace: ${identifier}] Processing ${txDetails.vout.length} outputs...`);
      const outputProcessingPromises = txDetails.vout.map(async (output, index) => {
        const outAddr = output.scriptpubkey_address;
        const outValue = output.value;

        if (outAddr) { // Only process if there's a standard address
          console.log(`[TXID Trace: ${identifier}] Processing output ${index} to address ${outAddr}...`);
          
          // For multi-level trace triggered by clicking a TXID, we primarily need the connected address nodes.
          // Extensive details like balance/total received for these addresses might be overkill here,
          // as they can be fetched if the user clicks on those address nodes.
          // We'll add a simpler address node if it's part of a TXID expansion.
          addNode({
            id: outAddr,
            label: `${outAddr.substring(0, 6)}...${outAddr.substring(outAddr.length - 4)}`,
            title: `Address: ${outAddr}`,
            type: 'address',
            shape: 'dot',
            color: '#5cb85c' // Default Green for address nodes
          });

          const edgeIdOut = `edge-out-${txDetails.txid}-${outAddr}-${index}`; // index for uniqueness if multiple outputs to same addr
          edges.push({
            id: edgeIdOut,
            from: txDetails.txid,
            to: outAddr,
            label: formatBalance(outValue), // Amount sent to this address
            arrows: { to: { enabled: true, scaleFactor: 1, type: 'arrow' } },
            title: `Output: ${formatBalance(outValue)} to ${outAddr}`
          });
          console.log(`[TXID Trace: ${identifier}] Added output edge: ${edgeIdOut}`);
        }
      });
      await Promise.all(outputProcessingPromises); // Wait for all outputs to be processed
      console.log(`[TXID Trace: ${identifier}] Finished processing outputs. Total edges: ${edges.length}`);

      console.log(`[TXID Trace: ${identifier}] Sending response with ${nodes.length} nodes and ${edges.length} edges.`);
      res.json({ nodes, edges }); // For TXID click, only nodes and edges are primary.

    } else if (isAddress) {
      // --- Handle Address ---
      // This path is for initial address search OR clicking an address node in the graph.
      // If it's a click on an address node, we primarily want connected TXs and edges.
      // The summaryData and recentTransactions are more for the initial, detailed address view.
      console.log(`[Address Trace: ${identifier}] Starting trace...`);
      console.log(`[Address Trace: ${identifier}] Fetching address details, transactions, and Chainabuse status...`);
      // Fetch address details (for stats) and recent TXs concurrently
      // Removed Chainabuse call from Promise.all
      const [addressDetailsRes, addressTxsRes] = await Promise.all([
         axios.get(`https://mempool.space/api/address/${identifier}`).catch(e => e.response || e), // Catch errors to check status
         axios.get(`https://mempool.space/api/address/${identifier}/txs`).catch(e => e.response || e) // Catch errors
         // checkChainabuse(identifier) // Chainabuse call removed
      ]);
      console.log(`[Address Trace: ${identifier}]   - Mempool details fetch status: ${addressDetailsRes?.status || addressDetailsRes?.message}`);
      // Log raw details response for balance debugging
      if (!(addressDetailsRes instanceof Error) && addressDetailsRes.status < 400) {
          console.log('[Address Trace] Raw Mempool Address Details:', JSON.stringify(addressDetailsRes.data, null, 2));
      }
      console.log(`[Address Trace: ${identifier}]   - Mempool TXs fetch status: ${addressTxsRes?.status || addressTxsRes?.message}`);
      // console.log(`[Address Trace: ${identifier}]   - Chainabuse result:`, reportResult); // Chainabuse removed


      // Handle potential errors from Mempool calls
      if (addressDetailsRes instanceof Error || addressDetailsRes.status >= 400) {
          const status = addressDetailsRes?.status || 500;
          const message = addressDetailsRes?.data || addressDetailsRes?.message || 'Failed to fetch address details';
          console.error(`[Address Trace: ${identifier}] Error fetching details from Mempool:`, message);
          return res.status(status).json({ message: `Mempool API error: ${message}`, error: addressDetailsRes?.message });
      }
       if (addressTxsRes instanceof Error || addressTxsRes.status >= 400) {
          const status = addressTxsRes?.status || 500;
          const message = addressTxsRes?.data || addressTxsRes?.message || 'Failed to fetch address transactions';
          console.error(`[Address Trace: ${identifier}] Error fetching transactions from Mempool:`, message);
           return res.status(status).json({ message: `Mempool API error: ${message}`, error: addressTxsRes?.message });
      }

      const addressDetails = addressDetailsRes.data;
      const allFetchedAddressTxs = addressTxsRes.data; // Use all fetched TXs for analysis (typically up to 25 from Mempool)
      const addressTxsForDisplay = allFetchedAddressTxs.slice(0, 10); // Limit to 10 recent TXs for display list
      console.log(`[Address Trace: ${identifier}] Fetched ${addressTxsForDisplay.length} transactions for display list, ${allFetchedAddressTxs.length} total for analysis.`);

      // Process results
      // Extract stats for balance calculation
      const stats = addressDetails?.chain_stats;
      const fundedSat = Number(stats?.funded_txo_sum) || 0;
      const spentSat = Number(stats?.spent_txo_sum) || 0;
      const confirmedBalanceSat = fundedSat - spentSat;
      console.log(`[Address Trace: ${identifier}] Stats - Funded: ${fundedSat}, Spent: ${spentSat}, Confirmed Balance: ${confirmedBalanceSat}`);

      // Format values for display
      const totalReceivedBTCStr = formatBalance(fundedSat);
      const confirmedBalanceBTCStr = formatBalance(confirmedBalanceSat);
      console.log(`[Address Trace: ${identifier}] Formatted - Received: ${totalReceivedBTCStr}, Confirmed Balance: ${confirmedBalanceBTCStr}`);

      // Node color is now default, Chainabuse info removed from title
      let nodeColor = '#5cb85c'; // Default Green for central address node
      let exchangeName = KNOWN_EXCHANGES[identifier] || null;
      // Update node title to remove Chainabuse info
      const nodeTitle = `Address: ${identifier}\nConfirmed Balance: ${confirmedBalanceBTCStr}\nTotal Received: ${totalReceivedBTCStr}${exchangeName ? `\nExchange: ${exchangeName}` : ''}`;

      console.log(`[Address Trace: ${identifier}] Adding central address node.`);
      // Add the central address node
      // Step 2: Log node object before adding
      const nodeObject = {
        id: identifier,
        label: `${identifier.substring(0, 8)}...${identifier.substring(identifier.length - 6)}`,
        title: nodeTitle, // Use constructed title
        type: 'address',
        shape: 'dot',
        color: nodeColor, // Default color
        size: 25, // Make central node larger
        // isReported: isReported, // Chainabuse removed
        // reportCount: chainabuseInfo?.reportCount, // Chainabuse removed
        totalReceivedBTC: totalReceivedBTCStr, // Keep for potential use
        totalReceivedSat: fundedSat, // Keep raw funded value
        confirmedBalanceBTC: confirmedBalanceBTCStr, // Add confirmed balance
        confirmedBalanceSat: confirmedBalanceSat, // Add raw confirmed balance
        exchange: exchangeName
        // chainabuseInfo: chainabuseInfo // Chainabuse removed
      };
      console.log('[API /trace - Address] Node object being added:', JSON.stringify(nodeObject, null, 2));
      addNode(nodeObject);

      // Add nodes for recent transactions and edges connecting them
      console.log(`[Address Trace: ${identifier}] Adding nodes and edges for ${addressTxsForDisplay.length} transactions (display list)...`);
      addressTxsForDisplay.forEach(tx => {
        addNode({
          id: tx.txid,
          label: `TX: ${tx.txid.substring(0, 8)}...`,
          title: `Transaction ID: ${tx.txid}\nFee: ${formatBalance(tx.fee)}\nStatus: ${tx.status?.confirmed ? 'Confirmed' : 'Unconfirmed'}`,
          type: 'transaction',
          shape: 'box',
          color: '#f0ad4e' // Orange for TX
        });

        const isInput = tx.vin.some(vin => vin.prevout?.scriptpubkey_address === identifier);
        const isOutput = tx.vout.some(vout => vout.scriptpubkey_address === identifier);

        if (isInput) {
          const edgeIdIn = `edge-addr-${identifier}-${tx.txid}`;
          edges.push({
            id: edgeIdIn,
            from: identifier,
            to: tx.txid,
            arrows: { to: { enabled: true, scaleFactor: 1, type: 'arrow' } },
            title: `Spent from ${identifier} in TX ${tx.txid.substring(0,8)}...`
          });
          console.log(`[Address Trace: ${identifier}] Added input edge: ${edgeIdIn}`);
        }
        if (isOutput) {
          const edgeIdOut = `edge-addr-${tx.txid}-${identifier}`;
          edges.push({
            id: edgeIdOut,
            from: tx.txid,
            to: identifier,
            arrows: { to: { enabled: true, scaleFactor: 1, type: 'arrow' } },
            title: `Received by ${identifier} in TX ${tx.txid.substring(0,8)}...`
          });
          console.log(`[Address Trace: ${identifier}] Added output edge: ${edgeIdOut}`);
        }
      });
      console.log(`[Address Trace: ${identifier}] Finished processing graph nodes/edges. Total edges: ${edges.length}`);
      
      // For an address click (multi-level trace), the frontend primarily needs nodes and edges.
      // Summary and recent transactions are more for the initial full page load for an address.
      // We can decide if we want to always return summary/tx list or only for initial.
      // For now, let's keep them for initial address searches.
      // A flag could be added to the request if it's a "merge" request vs "initial"
      // but the current structure doesn't have that. The frontend just calls /api/trace/:nodeId.

      // If the request was for an address that is NOT the initial search (e.g. clicked in graph)
      // then we might not need to recalculate all summary/recentTX.
      // However, the current structure will do it.
      // The key is that `nodes` and `edges` are populated for the graph merge.

      const summaryData = {
        address: identifier,
        totalReceivedBTC: totalReceivedBTCStr,
        confirmedBalanceBTC: confirmedBalanceBTCStr,
        exchange: exchangeName
        // behavioralPatterns will be added below
      };
      
      // --- Behavioral Analysis Integration ---
      console.log(`[Address Trace: ${identifier}] Starting behavioral analysis on ${allFetchedAddressTxs.length} transactions...`);
      const behavioralPatterns = [];

      // 1. High Transaction Volume
      const highVolumeResult = analyzeHighTransactionVolume(allFetchedAddressTxs);
      if (highVolumeResult.detected) {
          behavioralPatterns.push({
              name: "High Transaction Volume",
              details: {
                  count: highVolumeResult.count,
                  windowHours: highVolumeResult.windowHours
                  // threshold field removed as per stricter feedback interpretation
              }
          });
      }

      // 2. Consolidation/Fragmentation
      const consFragResult = analyzeConsolidationFragmentation(allFetchedAddressTxs, identifier);
      if (consFragResult.consolidationDetected) {
          behavioralPatterns.push({
              name: "Consolidation/Fragmentation", // Changed name
              details: {
                  type: "consolidation",
                  count: consFragResult.consolidationEvents,
                  threshold_inputs: consFragResult.uniqueIoThreshold
              }
          });
      }
      if (consFragResult.fragmentationDetected) {
          behavioralPatterns.push({
              name: "Consolidation/Fragmentation", // Changed name
              details: {
                  type: "fragmentation",
                  count: consFragResult.fragmentationEvents,
                  threshold_outputs: consFragResult.uniqueIoThreshold
              }
          });
      }
      
      // 3. Dusting
      const dustingResult = analyzeDusting(allFetchedAddressTxs, identifier);
      if (dustingResult.detected) {
          behavioralPatterns.push({
              name: "Dusting Activity", 
              details: {
                  count: dustingResult.count,
                  dustThresholdSat: dustingResult.dustThresholdSat
              }
          });
      }

      // 4. Rapid Influx from Multiple Sources
      console.log(`[API /trace] Passing ${allFetchedAddressTxs.length} transactions to analyzeRapidInflux for address ${identifier}`);
      // Increased timeWindowMinutes to 240 (4 hours)
      const rapidInfluxResult = analyzeRapidInflux(allFetchedAddressTxs, identifier, 240, 5, 3); 
      if (rapidInfluxResult.detected) {
          behavioralPatterns.push({
              name: "Rapid Influx from Multiple Sources",
              details: {
                  incomingTxCount: rapidInfluxResult.incomingTxCount,
                  uniqueSendersCount: rapidInfluxResult.uniqueSendersCount,
                  timeWindowMinutes: rapidInfluxResult.timeWindowMinutes
              }
          });
      }
      
      summaryData.behavioralPatterns = behavioralPatterns;
      console.log(`[Address Trace: ${identifier}] Behavioral analysis complete. Patterns found: ${behavioralPatterns.length}`);
      // --- END Behavioral Analysis Integration ---

      console.log(`[Address Trace: ${identifier}] Prepared summary data (with patterns):`, JSON.stringify(summaryData, null, 2));

      const recentTransactions = [];
      console.log(`[Address Trace: ${identifier}] Processing ${addressTxsForDisplay.length} raw transactions for recent list (display)...`);
      for (const tx of addressTxsForDisplay) {
          let valueIn = 0;
          let valueOut = 0;
          const inputAddresses = new Set(); // Use Set to avoid duplicates
          const outputAddresses = new Set();

          // Calculate value in and collect input addresses
          tx.vin.forEach(vin => {
              const addr = vin.prevout?.scriptpubkey_address;
              if (addr) {
                  inputAddresses.add(addr); // Collect all input addresses
                  if (addr === identifier) {
                      valueOut += vin.prevout?.value || 0;
                  }
              }
          });

          // Calculate value out and collect output addresses
          tx.vout.forEach(vout => {
              const addr = vout.scriptpubkey_address;
              if (addr) {
                  outputAddresses.add(addr); // Collect all output addresses
                  if (addr === identifier) {
                      valueIn += vout.value || 0;
                  }
              }
          });

          const netAmountSat = valueIn - valueOut;
          const direction = netAmountSat >= 0 ? 'in' : 'out'; // Treat 0 as 'in' for simplicity, though rare for target addr
          const amountBTC = formatBalance(Math.abs(netAmountSat)); // Use absolute value

          let counterparts = [];
          if (direction === 'in') {
              // Counterparts are the input addresses (excluding self if present, though unlikely for net 'in')
              counterparts = [...inputAddresses].filter(addr => addr !== identifier).slice(0, 2); // Limit to 2
          } else { // direction === 'out'
              // Counterparts are the output addresses (excluding self)
              counterparts = [...outputAddresses].filter(addr => addr !== identifier).slice(0, 2); // Limit to 2
          }

          // Format timestamp directly here
            let formattedTimestamp = "Unconfirmed";
            if (tx.status?.confirmed && tx.status?.block_time) {
                try {
                    const date = new Date(tx.status.block_time * 1000);
                    // Using English locale for date/time format
                    formattedTimestamp = date.toLocaleString('en-US', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                  });
              } catch (e) {
                  console.error(`Error formatting timestamp for TX ${tx.txid}:`, e);
                  formattedTimestamp = "Invalid Date"; // Fallback on error
              }
          }

          recentTransactions.push({
              txid: tx.txid,
              timestamp: formattedTimestamp, // Use the locally formatted timestamp
              direction: direction,
              amountBTC: amountBTC,
              counterparts: counterparts,
              isConfirmed: tx.status?.confirmed || false
          });
      }
      console.log(`[Address Trace: ${identifier}] Finished processing recent transactions list.`);

      console.log(`[Address Trace: ${identifier}] Sending final response including summary and recent transactions.`);
      // --- Send Combined Response ---
      res.json({
          nodes,
          edges,
          summaryData,
          recentTransactions
      });

    } else {
      console.warn(`Invalid identifier format received: ${identifier}`);
      res.status(400).json({ message: 'Invalid identifier format. Provide a valid Bitcoin address or TXID.' });
    }
  } catch (error) {
    // Step 4: Ensure main catch block sends JSON response
    console.error(`--- UNHANDLED ERROR in /api/trace/${identifier} ---`, error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});


// 7. Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
