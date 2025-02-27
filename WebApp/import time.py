import time
import sqlite3
import json
import smtplib
from email.mime.text import MIMEText
from collections import defaultdict
from flask import Flask, render_template, request
import requests
import xrpl
import plotly.graph_objs as go
from plotly.utils import PlotlyJSONEncoder
import logging

app = Flask(__name__)

# Database setup
def setup_db():
    conn = sqlite3.connect('wash_trading.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS trades
                 (timestamp TEXT, sender TEXT, receiver TEXT, asset TEXT, volume REAL, txn_fee REAL, flag TEXT,
                  tx_hash TEXT, tx_type TEXT, date TEXT, sequence INT, memos TEXT, flags INT, balance_changes TEXT)''')
    conn.commit()
    return conn

# Store recent transactions and account relationships
account_pairs = defaultdict(list)
parent_child_map = defaultdict(list)

# Setup logger for suspicious trade logging
logging.basicConfig(filename='suspicious_trades.log', level=logging.INFO)

# Slack Webhook URL (replace with your actual Slack webhook)
SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/your/webhook/url"

# Email setup
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
EMAIL_ADDRESS = 'your-email@gmail.com'
EMAIL_PASSWORD = 'your-password'

def send_email_notification(subject, body):
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = EMAIL_ADDRESS
    msg['To'] = EMAIL_ADDRESS
    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
    server.starttls()
    server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
    server.sendmail(EMAIL_ADDRESS, [EMAIL_ADDRESS], msg.as_string())
    server.quit()

def send_slack_notification(message):
    payload = {"text": message}
    requests.post(SLACK_WEBHOOK_URL, json=payload)

# Track account activations (parent-child relationships)
def track_account_activation(parent, child):
    parent_child_map[parent].append(child)

# Calculate balance changes (placeholder logic)
def calculate_balance_changes(trade_data):
    return {
        "sender": trade_data['Amount'],
        "receiver": trade_data['Amount']
    }

# Function to detect nuanced wash trading, spoofing, and patterns
def detect_wash_trade_or_spoofing(trade_data, account_pairs, parent_child_map):
    sender = trade_data['sender']
    receiver = trade_data['receiver']
    asset = trade_data['asset']
    volume = trade_data['volume']
    txn_fee = trade_data['txn_fee']
    timestamp = trade_data['timestamp']
    
    # Condition 1: Self-trade (same sender and receiver)
    if sender == receiver:
        return True
    
    # Track trades between account pairs
    account_pair_key = f"{sender}-{receiver}"
    account_pairs[account_pair_key].append((timestamp, volume))
    
    # Remove old trades (trades older than 30 minutes)
    account_pairs[account_pair_key] = [t for t in account_pairs[account_pair_key] if timestamp - t[0] < 1800]
    
    # Condition 2: Frequent trades between the same pair within a short time
    if len(account_pairs[account_pair_key]) > 5:
        return True
    
    # Condition 3: Cross-account wash trading
    net_volume = sum([t[1] for t in account_pairs[account_pair_key]]) 
    if abs(net_volume) < 0.001:
        return True
    
    # Condition 4: Low transaction fees indicative of non-genuine trades
    if txn_fee < 0.00001:
        return True
    
    # Condition 5: Repeated minimal price/volume differences indicating price manipulation
    last_trade = account_pairs[account_pair_key][-1]
    if abs(last_trade[1] - volume) < 0.001:
        return True
    
    # NEW: Condition 6: Synchronized trading between parent and child accounts
    if sender in parent_child_map:
        for child in parent_child_map[sender]:
            child_pair_key = f"{child}-{receiver}"
            if child_pair_key in account_pairs:
                child_last_trade = account_pairs[child_pair_key][-1]
                if abs(child_last_trade[0] - timestamp) < 300:
                    return True
    
    # NEW: Condition 7: Pattern-based spoofing detection
    if 'canceled' in trade_data and trade_data['canceled'] and len(account_pairs[account_pair_key]) > 10:
        return True
    
    return False

# Store trades into the database
def store_trade(conn, trade_data, flag):
    try:
        c = conn.cursor()
        c.execute("INSERT INTO trades (timestamp, sender, receiver, asset, volume, txn_fee, flag, tx_hash, tx_type, date, sequence, memos, flags, balance_changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                  (trade_data['timestamp'], trade_data['sender'], trade_data['receiver'], trade_data['asset'],
                   trade_data['volume'], trade_data['txn_fee'], flag, trade_data['tx_hash'], trade_data['tx_type'],
                   trade_data['date'], trade_data['sequence'], json.dumps(trade_data['memos']), trade_data['flags'],
                   json.dumps(trade_data['balance_changes'])))
        conn.commit()
    except Exception as e:
        logging.error(f"Error storing trade data: {e}")

# Monitor trades and detect wash trading, spoofing, or synchronized behavior
def monitor_trades(conn, client):
    account_pairs = defaultdict(list)
    parent_child_map = defaultdict(list)
    
    while True:
        response = client.recv()
        if response:
            trade_data = json.loads(response)
            parsed_trade = {
                "timestamp": time.time(),
                "sender": trade_data['Account'],
                "receiver": trade_data['Destination'],
                "asset": trade_data['Amount'],
                "volume": trade_data['TxnFee'],
                "txn_fee": trade_data['TxnFee'],
                "canceled": trade_data.get('canceled', False),
                "tx_hash": trade_data['hash'],
                "tx_type": trade_data['TransactionType'],
                "date": trade_data['date'],
                "sequence": trade_data['Sequence'],
                "memos": trade_data.get('Memos', []),
                "flags": trade_data.get('Flags', 0),
                "balance_changes": calculate_balance_changes(trade_data)
            }
            
            is_suspicious = detect_wash_trade_or_spoofing(parsed_trade, account_pairs, parent_child_map)
            flag = "suspicious" if is_suspicious else "normal_trade"
            store_trade(conn, parsed_trade, flag)

            if flag == "suspicious":
                message = (
                    f"Suspicious trade detected:\n"
                    f"Sender: {parsed_trade['sender']}\n"
                    f"Receiver: {parsed_trade['receiver']}\n"
                    f"Volume: {parsed_trade['volume']}\n"
                    f"Asset: {parsed_trade['asset']}\n"
                    f"Txn Fee: {parsed_trade['txn_fee']}\n"
                    f"Tx Hash: {parsed_trade['tx_hash']}\n"
                    f"Tx Type: {parsed_trade['tx_type']}\n"
                    f"Date: {parsed_trade['date']}\n"
                    f"Sequence: {parsed_trade['sequence']}\n"
                    f"Memos: {parsed_trade['memos']}\n"
                    f"Flags: {parsed_trade['flags']}\n"
                    f"Balance Changes: {parsed_trade['balance_changes']}"
                )
                send_email_notification("Suspicious Trade Alert", message)
                send_slack_notification(message)
                logging.info(message)

# Run Flask app and WebSocket monitoring
if __name__ == "__main__":
    conn = setup_db()
    client = xrpl.clients.WebsocketClient("wss://xrplcluster.com")
    
    monitor_trades(conn, client)
    app.run(debug=True)