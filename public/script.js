document.addEventListener('DOMContentLoaded', () => {
    const arrowUpSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="green" class="bi bi-arrow-up-circle-fill" viewBox="0 0 16 16">
      <path d="M16 8A8 8 0 1 0 0 8a8 8 0 0 0 16 0zm-7.5 3.5a.5.5 0 0 1-1 0V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707V11.5z"/>
    </svg>`;
    const arrowDownSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="red" class="bi bi-arrow-down-circle-fill" viewBox="0 0 16 16">
      <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.5 4.5a.5.5 0 0 0-1 0v5.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V4.5z"/>
    </svg>`;

    const identifierInput = document.getElementById('identifierInput');
    const traceButton = document.getElementById('traceButton');
    const resetButton = document.getElementById('resetButton');
    const resetGraphButton = document.getElementById('resetGraphButton');
    const fullscreenGraphButton = document.getElementById('fullscreenGraphButton'); // Fullscreen button
    const resultsArea = document.getElementById('resultsArea');
    const summaryContainer = document.getElementById('summaryContainer');
    const graphContainer = document.getElementById('graphContainer'); // Already defined
    const transactionsContainer = document.getElementById('transactionsContainer');
    const exportControls = document.getElementById('exportControls');
    const legendContainer = document.getElementById('legendContainer');

    let network = null;
    let visNodes = null;
    let visEdges = null;
    let currentSummaryData = null;
    let currentTransactionsData = null;
    let initialGraphNodes = null;
    let initialGraphEdges = null;

    if (exportControls) exportControls.style.display = 'none';
    if (legendContainer) legendContainer.style.display = 'none';

    function downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function escapeCsvCell(cellData) {
        if (cellData === null || typeof cellData === 'undefined') return '';
        let cellString = String(cellData);
        if (cellString.includes(',') || cellString.includes('"') || cellString.includes('\n')) {
            cellString = cellString.replace(/"/g, '""');
            return `"${cellString}"`;
        }
        return cellString;
    }

    function exportDataAsJson() {
        if (!visNodes || !visEdges || visNodes.length === 0) {
            alert("No graph data available to export.");
            return;
        }
        const nodesArray = visNodes.get({ returnType: 'Array' });
        const edgesArray = visEdges.get({ returnType: 'Array' });
        const dataToExport = {
            summary: currentSummaryData || {},
            nodes: nodesArray,
            edges: edgesArray,
            recentTransactions: currentTransactionsData || []
        };
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const filename = `follow-your-money-graph-${Date.now()}.json`;
        downloadFile(filename, jsonString, 'application/json;charset=utf-8;');
    }

    function exportTransactionsAsCsv() {
        if (!currentTransactionsData || currentTransactionsData.length === 0) {
            alert("No transaction data available to export.");
            return;
        }
        const header = "Direction,Timestamp,Amount BTC,Counterparts,TXID,Confirmed\n";
        let csvRows = currentTransactionsData.map(tx => {
            const counterpartsStr = tx.counterparts ? tx.counterparts.join('; ') : '';
            return [
                escapeCsvCell(tx.direction),
                escapeCsvCell(tx.timestamp),
                escapeCsvCell(tx.amountBTC),
                escapeCsvCell(counterpartsStr),
                escapeCsvCell(tx.txid),
                escapeCsvCell(tx.isConfirmed)
            ].join(',');
        });
        const csvContent = header + csvRows.join('\n');
        const filename = `follow-your-money-transactions-${Date.now()}.csv`;
        downloadFile(filename, csvContent, 'text/csv;charset=utf-8;');
    }

    function mergeGraphData(newData) {
        if (!newData || (!newData.nodes && !newData.edges)) {
            console.warn('mergeGraphData: No new data.');
            return;
        }
        const newNodes = newData.nodes || [];
        const newEdges = newData.edges || [];
        let nodesAddedCount = 0, edgesAddedCount = 0;

        if (visNodes) newNodes.forEach(node => { if (!visNodes.get(node.id)) { visNodes.add(node); nodesAddedCount++; } });
        else console.error('visNodes DataSet not initialized for merge.');

        if (visEdges) {
            newEdges.forEach(newEdgeData => {
                if (typeof newEdgeData.from === 'undefined' || typeof newEdgeData.to === 'undefined') {
                    console.warn('Skipping edge due to missing from/to:', newEdgeData);
                    return;
                }
                if (!visEdges.get(newEdgeData.id)) {
                    const edgeToAdd = {
                        id: newEdgeData.id,
                        from: newEdgeData.from,
                        to: newEdgeData.to,
                        arrows: { to: { enabled: true, scaleFactor: 1, type: 'arrow' } },
                        label: newEdgeData.label || '',
                        title: newEdgeData.title || newEdgeData.label || ''
                    };
                    visEdges.add(edgeToAdd);
                    edgesAddedCount++;
                }
            });
        } else {
            console.error('visEdges DataSet not initialized for merge.');
        }
        
        console.log(`Merged: ${nodesAddedCount} new nodes, ${edgesAddedCount} new edges.`);
        if (newData.recentTransactions) currentTransactionsData = newData.recentTransactions;
        if (exportControls && ((visNodes && visNodes.length > 0) || (currentTransactionsData && currentTransactionsData.length > 0))) {
            exportControls.style.display = 'block';
        }
    }

    async function fetchAndMergeTraceData(identifier, type) {
        console.log(`Fetching merge data for ${type}: ${identifier}`);
        summaryContainer.innerHTML += '<p id="loadingIndicator">Loading more data...</p>';
        try {
            const response = await fetch(`/api/trace/${encodeURIComponent(identifier)}`);
            if (response.ok) {
                const newData = await response.json();
                mergeGraphData(newData);
            } else {
                const errorText = await response.text();
                summaryContainer.innerHTML += `<p class="error">Failed to load more data: ${errorText}</p>`;
            }
        } catch (error) {
            summaryContainer.innerHTML += `<p class="error">Error loading more data.</p>`;
        } finally {
            document.getElementById('loadingIndicator')?.remove();
        }
    }

    function displayResults(data, isInitialTrace) {
        console.log('--- DEBUG: displayResults, isInitial:', isInitialTrace, 'data:', data);
        currentSummaryData = data.summaryData || null;
        currentTransactionsData = data.recentTransactions || null;

        if (isInitialTrace) {
            initialGraphNodes = data.nodes ? JSON.parse(JSON.stringify(data.nodes)) : null;
            initialGraphEdges = data.edges ? JSON.parse(JSON.stringify(data.edges)) : null;
        }
        
        if (network) { network.destroy(); network = null; }
        summaryContainer.innerHTML = '';
        graphContainer.innerHTML = '';
        transactionsContainer.innerHTML = '';
        let hasDisplayableData = false;

        if (summaryContainer && data.summaryData) {
            const summary = data.summaryData;
            let summaryHTML = `<h4>Summary</h4><p><strong>Address:</strong> <a href="https://mempool.space/address/${summary.address}" target="_blank">${summary.address}</a></p><p><strong>Balance:</strong> ${summary.confirmedBalanceBTC ?? 'N/A'}</p><p><strong>Received:</strong> ${summary.totalReceivedBTC ?? 'N/A'}</p><p><strong>Chainabuse:</strong> <a href="https://chainabuse.com/address/${summary.address}" target="_blank" rel="noopener noreferrer">Check</a></p><p><strong>Arkham:</strong> <a href="https://platform.arkhamintelligence.com/explorer/address/${summary.address}" target="_blank" rel="noopener noreferrer">Check</a></p>${summary.exchange ? `<p><span class="exchange">[🏢 ${summary.exchange}]</span></p>` : ''}`;
            
            // Add Behavioral Patterns Section
            if (summary.behavioralPatterns) { // Check if the field exists
                summaryHTML += `<h4>Behavioral Patterns Observed:</h4>`;
                if (summary.behavioralPatterns.length > 0) {
                    summaryHTML += `<ul>`;
                    summary.behavioralPatterns.forEach(pattern => {
                        let description = ""; // Initialize description
                        let displayName = pattern.name; // Default display name

                        if (pattern.name === "High Transaction Volume" && pattern.details) {
                            description = `Unusually high activity: ${pattern.details.count} transactions in the last ${pattern.details.windowHours} hours.`;
                        } else if (pattern.name === "Consolidation/Fragmentation" && pattern.details) {
                            if (pattern.details.type === "consolidation") {
                                displayName = "Consolidation Activity"; // More specific display name
                                description = `Funds may have been gathered: Observed ${pattern.details.count} instance(s) of receiving from ${pattern.details.threshold_inputs || 5} or more different addresses at once.`;
                            } else if (pattern.details.type === "fragmentation") {
                                displayName = "Fragmentation Activity"; // More specific display name
                                description = `Funds may have been split: Observed ${pattern.details.count} instance(s) of sending to ${pattern.details.threshold_outputs || 5} or more different addresses at once.`;
                            } else {
                                description = "Consolidation/fragmentation details not fully specified."; // Fallback
                            }
                        } else if (pattern.name === "Dusting Activity" && pattern.details) { // Changed from "Potential Dusting Activity" to match backend
                            description = `Multiple very small (dust) amounts received: ${pattern.details.count} transactions below ${pattern.details.dustThresholdSat} satoshis detected.`;
                        } else if (pattern.name === "Rapid Influx from Multiple Sources" && pattern.details) {
                            description = `Multiple payments received quickly: ${pattern.details.incomingTxCount} incoming transactions from ~${pattern.details.uniqueSendersCount} different sources within ~${pattern.details.timeWindowMinutes} minutes. This can indicate an address is actively collecting funds.`;
                        } else {
                            description = pattern.description || "Details not available."; // Fallback
                        }
                        summaryHTML += `<li><strong>${displayName}:</strong> ${description}</li>`;
                    });
                    summaryHTML += `</ul>`;
                    // Add Chainabuse link only if patterns were detected
                    summaryHTML += `<p style="margin-top: 10px;">Given the observed patterns, you might want to check this address on <a href="https://chainabuse.com/address/${summary.address}" target="_blank" rel="noopener noreferrer">Chainabuse</a> for community reports.</p>`;

                } else {
                    summaryHTML += `<p>No specific high-risk behavioral patterns detected based on simple heuristics.</p>`;
                }
                summaryHTML += `<p style="font-size:0.8em; color: #555; margin-top: 5px;"><em>Note: These are heuristic observations and do not definitively indicate illicit activity. Always perform thorough due diligence.</em></p>`;
            }
            summaryContainer.innerHTML = summaryHTML;
            hasDisplayableData = true;
        } else if (summaryContainer) summaryContainer.innerHTML = '<p>Summary N/A.</p>';

        if (data.nodes && data.edges) {
            if (!graphContainer) {
                summaryContainer.innerHTML += '<p class="error">Graph container missing!</p>';
                if (exportControls) exportControls.style.display = 'none';
                return;
            }
            visNodes = new vis.DataSet(data.nodes);
            visEdges = new vis.DataSet(data.edges);
            const graphData = { nodes: visNodes, edges: visEdges };
            const options = { 
                layout: { hierarchical: { enabled: false }, improvedLayout: true },
                nodes: { shape: 'dot', size: 16, font: { size: 12, color: '#333' }, borderWidth: 2 },
                edges: { arrows: { to: { enabled: true, scaleFactor: 1, type: 'arrow' } }, color: { color: '#848484', highlight: '#848484', hover: '#848484' }, font: { size: 10, align: 'middle' }, width: 1, smooth: { enabled: true, type: "cubicBezier", forceDirection: "horizontal", roundness: 0.4 }},
                physics: { solver: 'repulsion', repulsion: { centralGravity: 0.2, springLength: 100, springConstant: 0.05, nodeDistance: 150, damping: 0.09 }},
                interaction: { tooltipDelay: 200, hideEdgesOnDrag: true, navigationButtons: true, keyboard: true },
            };
            try {
                network = new vis.Network(graphContainer, graphData, options); // network is assigned here
                hasDisplayableData = true;
                network.on('click', async params => {
                    if (params.nodes.length > 0) {
                        const clickedNodeData = visNodes.get(params.nodes[0]);
                        if (clickedNodeData && (clickedNodeData.type === 'address' || clickedNodeData.type === 'transaction')) {
                            await fetchAndMergeTraceData(params.nodes[0], clickedNodeData.type);
                        }
                    }
                });
            } catch (e) { graphContainer.innerHTML = `<p class="error">Failed to render graph: ${e.message}</p>`; }
        } else graphContainer.innerHTML = data.summaryData ? '<p>No graph data.</p>' : '<p class="error">Graph data N/A.</p>';
        
        if (data.recentTransactions) {
            transactionsContainer.innerHTML = '<h4>Recent Transactions (Max 10)</h4>';
            if (data.recentTransactions.length === 0) transactionsContainer.innerHTML += '<p>None found.</p>';
            else {
                hasDisplayableData = true;
                let txHtml = '<table><thead><tr><th></th><th>Time</th><th>Amount</th><th>Counterparts</th><th>TXID</th></tr></thead><tbody>';
                data.recentTransactions.forEach(tx => {
                    txHtml += `<tr class="${tx.direction === 'in' ? 'tx-in-row' : 'tx-out-row'}"><td>${tx.direction === 'in' ? arrowUpSVG : arrowDownSVG}</td><td>${tx.timestamp ? tx.timestamp : 'Pending'}${tx.isConfirmed ? '' : ' (Unconf.)'}</td><td>${tx.amountBTC}</td><td>${tx.counterparts.map(a=>`${a.slice(0,6)}...${a.slice(-4)}`).join(', ') || '(Internal)'}</td><td><a href="https://mempool.space/tx/${tx.txid}" target="_blank">${tx.txid.slice(0,8)}...</a></td></tr>`;
                });
                transactionsContainer.innerHTML += txHtml + '</tbody></table>';
            }
        } else if (data.summaryData) transactionsContainer.innerHTML = '<p>Transactions N/A.</p>';

        if (exportControls) {
            exportControls.style.display = hasDisplayableData && ((visNodes && visNodes.length > 0) || (currentTransactionsData && currentTransactionsData.length > 0)) ? 'block' : 'none';
        }
        if (legendContainer) {
            legendContainer.style.display = hasDisplayableData ? 'block' : 'none';
        }
    }

    function displayError(message) {
        if (network) { network.destroy(); network = null; }
        summaryContainer.innerHTML = message ? `<p class="error">Error: ${message}</p>` : '';
        graphContainer.innerHTML = '';
        transactionsContainer.innerHTML = '';
        currentSummaryData = null; currentTransactionsData = null;
        visNodes = null; visEdges = null;
        initialGraphNodes = null; initialGraphEdges = null;
        if (exportControls) exportControls.style.display = 'none';
        if (legendContainer) legendContainer.style.display = 'none';
    }
    
    function resetApplicationState() {
        identifierInput.value = '';
        if (network) { network.destroy(); network = null; }
        summaryContainer.innerHTML = '';
        graphContainer.innerHTML = '';
        transactionsContainer.innerHTML = '';
        visNodes = null; visEdges = null;
        currentSummaryData = null; currentTransactionsData = null;
        initialGraphNodes = null; initialGraphEdges = null;
        if (exportControls) exportControls.style.display = 'none';
        if (legendContainer) legendContainer.style.display = 'none';
        identifierInput.focus();
        console.log("Application state reset.");
    }

    function resetGraphToInitial() {
        if (!network || !visNodes || !visEdges || !initialGraphNodes || !initialGraphEdges) {
            console.warn("Cannot reset graph: Network or initial data missing.");
            alert("No initial graph data to reset to. Perform a new search first if graph is empty, or graph was not loaded.");
            return;
        }
        try {
            visNodes.clear();
            visEdges.clear();
            visNodes.add(JSON.parse(JSON.stringify(initialGraphNodes)));
            visEdges.add(JSON.parse(JSON.stringify(initialGraphEdges)));
            network.fit();
            console.log("Graph view reset to initial state.");
        } catch (e) {
            console.error("Error resetting graph to initial state:", e);
            alert("An error occurred while resetting the graph view.");
        }
    }

    function toggleGraphFullscreen() {
        if (!document.fullscreenElement && !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
            if (graphContainer.requestFullscreen) {
                graphContainer.requestFullscreen();
            } else if (graphContainer.mozRequestFullScreen) { /* Firefox */
                graphContainer.mozRequestFullScreen();
            } else if (graphContainer.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
                graphContainer.webkitRequestFullscreen();
            } else if (graphContainer.msRequestFullscreen) { /* IE/Edge */
                graphContainer.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { /* Chrome, Safari and Opera */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                document.msExitFullscreen();
            }
        }
    }

    traceButton.addEventListener('click', async () => {
        const identifier = identifierInput.value.trim();
        if (!identifier) {
            displayError("Please enter a Bitcoin address or TXID.");
            identifierInput.focus(); 
            return;
        }
        resetApplicationState();
        summaryContainer.innerHTML = '<p>Loading...</p>';

        try {
            const response = await fetch(`/api/trace/${encodeURIComponent(identifier)}`);
            if (response.ok) {
                const data = await response.json();
                displayResults(data, true);
            } else {
                const errorText = await response.text();
                let errorMessage = `Server responded with ${response.status}`;
                try { errorMessage += `: ${JSON.parse(errorText).error || errorText}`; } 
                catch (e) { errorMessage += `: ${errorText}`; }
                displayError(errorMessage);
            }
        } catch (error) { displayError(`Fetch error: ${error.message}.`); }
    });

    if (exportJsonButton) exportJsonButton.addEventListener('click', exportDataAsJson);
    if (exportCsvButton) exportCsvButton.addEventListener('click', exportTransactionsAsCsv);
    if (resetButton) resetButton.addEventListener('click', resetApplicationState);
    if (resetGraphButton) resetGraphButton.addEventListener('click', resetGraphToInitial);
    if (fullscreenGraphButton && graphContainer) { // Add listener for fullscreen button
        fullscreenGraphButton.addEventListener('click', toggleGraphFullscreen);
    }

    // Fullscreen change event listeners
    function handleFullscreenChange() {
        if (network) { // Check if network instance exists
            // Check if graphContainer is the fullscreen element or if no element is fullscreen (exited)
            const isGraphFullscreen = document.fullscreenElement === graphContainer ||
                                    document.webkitFullscreenElement === graphContainer ||
                                    document.mozFullScreenElement === graphContainer ||
                                    document.msFullscreenElement === graphContainer;
            
            // Only refit if the graph was the one entering/exiting fullscreen, or if exiting any fullscreen
            if (isGraphFullscreen || !document.fullscreenElement) {
                 setTimeout(() => {
                    network.fit();
                    console.log("Graph refitted due to fullscreen change.");
                }, 100); // Timeout helps ensure rendering is complete
            }
        }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
});
