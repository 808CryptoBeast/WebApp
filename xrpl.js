const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const axios = require('axios');
const express = require('express');
const xrpl = require('xrpl');
const Plotly = require('plotly.js-dist');

// Setup Express server
const app = express();

// Database setup
const db = new sqlite3.Database('wash_trading.db');
db.run(`CREATE TABLE IF NOT EXISTS trades (
    timestamp TEXT,
    sender TEXT,
    receiver TEXT,
    asset TEXT,
    volume REAL,
    txn_fee REAL,
    flag TEXT,
    tx_hash TEXT,
    tx_type TEXT,
    date TEXT,
    sequence INT,
    memos TEXT,
    flags INT,
    balance_changes TEXT
)`);

// Email setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-password'
    }
});

// Slack Webhook URL
const SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/your/webhook/url";

// Send email notifications
function sendEmailNotification(subject, body) {
    const mailOptions = {
        from: 'your-email@gmail.com',
        to: 'your-email@gmail.com',
        subject: subject,
        text: body
    };
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}

// Send Slack notifications
function sendSlackNotification(message) {
    axios.post(SLACK_WEBHOOK_URL, {
        text: message
    }).then(response => {
        console.log('Slack notification sent');
    }).catch(error => {
        console.log('Error sending Slack notification:', error);
    });
}

// Function to detect wash trading, spoofing, and synchronized behavior
function detectWashTradeOrSpoofing(trade, accountPairs, parentChildMap) {
    const sender = trade.sender;
    const receiver = trade.receiver;
    const volume = trade.volume;
    const timestamp = trade.timestamp;

    // Condition 1: Self-trade
    if (sender === receiver) return true;

    const accountPairKey = `${sender}-${receiver}`;
    if (!accountPairs[accountPairKey]) accountPairs[accountPairKey] = [];
    accountPairs[accountPairKey].push({ timestamp, volume });

    // Remove old trades
    accountPairs[accountPairKey] = accountPairs[accountPairKey].filter(t => timestamp - t.timestamp < 1800);

    // Condition 2: Frequent trades
    if (accountPairs[accountPairKey].length > 5) return true;

    // Condition 3: No significant net volume change
    const netVolume = accountPairs[accountPairKey].reduce((acc, t) => acc + t.volume, 0);
    if (Math.abs(netVolume) < 0.001) return true;

    // Condition 6: Synchronized trading between parent and child accounts
    if (parentChildMap[sender]) {
        for (const child of parentChildMap[sender]) {
            const childPairKey = `${child}-${receiver}`;
            if (accountPairs[childPairKey]) {
                const lastTrade = accountPairs[childPairKey].slice(-1)[0];
                if (Math.abs(lastTrade.timestamp - timestamp) < 300) return true;
            }
        }
    }
    return false;
}

// Store trades in the database
function storeTrade(trade, flag) {
    const stmt = db.prepare("INSERT INTO trades VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    stmt.run(
        trade.timestamp,
        trade.sender,
        trade.receiver,
        trade.asset,
        trade.volume,
        trade.txn_fee,
        flag,
        trade.tx_hash,
        trade.tx_type,
        trade.date,
        trade.sequence,
        JSON.stringify(trade.memos),
        trade.flags,
        JSON.stringify(trade.balance_changes)
    );
    stmt.finalize();
}

// Monitor trades and detect wash trading, spoofing, or synchronized behavior
async function monitorTrades() {
    const client = new xrpl.Client("wss://xrplcluster.com");
    await client.connect();

    const accountPairs = {};
    const parentChildMap = {};

    client.request({
        command: "subscribe",
        streams: ["transactions"]
    });

    client.on('transaction', async (tx) => {
        if (tx.transaction.TransactionType !== "Payment") return;

        const parsedTrade = {
            timestamp: Date.now(),
            sender: tx.transaction.Account,
            receiver: tx.transaction.Destination,
            asset: tx.transaction.Amount,
            volume: tx.transaction.Fee,
            txn_fee: tx.transaction.Fee,
            tx_hash: tx.transaction.hash,
            tx_type: tx.transaction.TransactionType,
            date: tx.transaction.date,
            sequence: tx.transaction.Sequence,
            memos: tx.transaction.Memos || [],
            flags: tx.transaction.Flags || 0,
            balance_changes: { sender: tx.transaction.Amount, receiver: tx.transaction.Amount }
        };

        const isSuspicious = detectWashTradeOrSpoofing(parsedTrade, accountPairs, parentChildMap);
        const flag = isSuspicious ? "suspicious" : "normal_trade";
        storeTrade(parsedTrade, flag);

        if (flag === "suspicious") {
            const message = `Suspicious trade detected:\nSender: ${parsedTrade.sender}\nReceiver: ${parsedTrade.receiver}\nVolume: ${parsedTrade.volume}\nAsset: ${parsedTrade.asset}`;
            sendEmailNotification("Suspicious Trade Alert", message);
            sendSlackNotification(message);
        }
    });
}

// Start the monitoring
monitorTrades();

// Start Express server to serve web dashboard
app.get('/', (req, res) => {
    db.all("SELECT * FROM trades", [], (err, rows) => {
        if (err) {
            throw err;
        }
        res.render('index', { trades: rows });
    });
});

app.get('/visualize', (req, res) => {
    db.all("SELECT timestamp, volume FROM trades WHERE flag = 'suspicious'", [], (err, rows) => {
        if (err) {
            throw err;
        }

        const timestamps = rows.map(row => row.timestamp);
        const volumes = rows.map(row => row.volume);

        const trace = {
            x: timestamps,
            y: volumes,
            mode: 'lines',
            name: 'Trade Volume'
        };

        const data = [trace];
        const layout = { title: 'Suspicious Trade Volume' };
        const graphJSON = JSON.stringify({ data, layout });

        res.render('visualize', { graphJSON });
    });
});

app.listen(3000, () => console.log('Server started on port 3000'));
