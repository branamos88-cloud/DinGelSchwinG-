# Enterprise Node Database - Getunnelt erreichbare Abfrageknotenpunkte

Strukturierte Datenbank der getunnelt erreichbaren Abfrageknotenpunkte (Nodes & Endpoints) für die geforderten Module (**MCP, API, Web-Hook, Notebook / `qloud_gp-cpu`, KI-Interferenz / Inferenz**), basierend auf der Architektur des Cyber-Physical & Automotive OS (BOS).

---

## Getunnelt erreichbare Abfrageknotenpunkte - Übersicht

| Kategorie | Knoten-ID / Name | Tunnel-Protokoll & Routing | Endpunkt / URL-Schema | Authentifizierung & Security | Primärer Einsatzzweck & Funktion |
| --- | --- | --- | --- | --- | --- |
| **1. MCP** | `mcp.agent.orchestrator` | WSS / HTTPS (Cloudflare Tunnel / Ngrok) | `wss://mcp-bridge.qloud.local/v1/tools` | Hardware-Token (Honeywell Akku-Token) + TLS 1.3 | Bidirektionales Tool-Calling und Echtzeit-Steuerung der Hardware-Brücken (UHAL, CAN, BLE) durch das lokale LLM. |
| **2. API** | `api.emobility.workspace` | HTTPS (Reverse Proxy / WireGuard) | `https://api.qloud-gp.local/v1/bms` | Bearer Token + AES-256 / SIL-Level Prüfungen | RESTful-Schnittstellen für BMS-Diagnose, Fahrzeug-Telemetrie und OBD-II Datenabfragen. |
| **3. Web-Hook** | `webhook.trigger.engine` | HTTPS POST (Public Gateway Tunnel) | `https://hook.qloud-gp.local/trigger/v1/event` | HMAC-SHA256 Signatur-Header | Asynchrone Event-Trigger (z. B. Google Drive Push Notifications, Alarm-Meldungen bei Grenzwertüberschreitung). |
| **4. Notebook** | `notebook.qloud_gp-cpu.exec` | HTTPS / Jupyter WebSocket Tunnel | `https://notebook.qloud-gp.local/lab/proxy/8888` | Token-Auth + OAuth2 / Local Vault Key | Interaktive Jupyter-Notebook-Instanzen zur Ausführung von Python-Skripten auf der QLOUD GP-CPU. |
| **5. KI-Inferenz** | `inference.edge.llm` | gRPC / HTTP/2 Tunnel | `https://inference.qloud-gp.local/v1/chat/completions` | Local GPG / Vault Auth + Int8 Quantisierung | Inferenz-Ausführung des quantisierten Small Language Models (Llama-3.1-3B) und Vektor-Suche via `sqlite-vec`. |

---

## Detaillierte Spezifikation der Abfrageknotenpunkte

### 1. MCP (Model Context Protocol) Node (`mcp.agent.orchestrator`)

**Tunnel-Konfiguration:** Gesicherter WebSocket-Tunnel (WSS) über Cloudflare Tunnels oder Ngrok mit End-to-End-Verschlüsselung.

**Payload-Struktur (JSON-RPC 2.0):**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "send_sendCommand",
    "arguments": {
      "target_device": "CT45P_UART_BRIDGE",
      "payload_hex": "[0x03, 0x00, 0x01, 0xAA, 0x55]"
    }
  },
  "id": 1
}
```

**Sicherheits-Layer:** Erfordert einen validen Hardware-Root-of-Trust Akku-Token zur Autorisierung von Schreib- und Steuerungsbefehlen.

**Verwendungsbeispiel:**
```typescript
import { getNodeConfig } from '../src/config/enterprise-nodes';

const mcpNode = getNodeConfig('MCP');
console.log(`Connecting to: ${mcpNode.endpointUrl}`);
console.log(`Auth: ${mcpNode.authentication}`);
```

---

### 2. API Node (`api.emobility.workspace`)

**Tunnel-Konfiguration:** WireGuard-Tunnel oder Reverse-Proxy mit SSL-Termination.

**Verfügbare Endpunkte:**

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/v1/bms/status` | Ruft Echtzeit-Zellspannungen, SOH (State of Health) und Temperaturen ab. |
| POST | `/v1/diagnostic/reset` | Initiiert den Factory-Reset mit Audit-Logging. |

**Sicherheits-Layer:** 
- AES-256 Verschlüsselung
- Rollenbasierte Zugriffskontrolle (RBAC) für Servicetechniker
- SIL-Level (Safety Integrity Level) Prüfungen

**cURL Beispiel:**
```bash
curl -X GET \
  https://api.qloud-gp.local/v1/bms/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

### 3. Web-Hook Node (`webhook.trigger.engine`)

**Tunnel-Konfiguration:** Öffentlicher Webhook-Endpoint via Ngrok / Cloudflare Public Subdomain.

**Einsatzbereich:** Verarbeitet externe Push-Benachrichtigungen:
- Google Drive API Watch-Trigger für Delta-Syncs von Dokumenten
- Alarm-Meldungen bei Grenzwertüberschreitung
- Sensor-Anomalie-Erkennung
- System-Heartbeat Signale

**Validierung:** Jedes eintreffende Paket wird gegen einen HMAC-SHA256 Secret Key geprüft.

**Webhook Payload Beispiel:**
```json
{
  "event": "alarm.threshold_exceeded",
  "timestamp": "2026-08-09T14:38:56Z",
  "data": {
    "sensor_id": "TEMP_01",
    "current_value": 85.5,
    "threshold": 80.0
  }
}
```

---

### 4. Notebook Node (`notebook.qloud_gp-cpu.exec`)

**Tunnel-Konfiguration:** JupyterLab Server hinter einem HTTPS-Reverse-Proxy mit Port-Weiterleitung auf den lokalen Edge-Prozessor (QCS4290 / GP-CPU).

**Unterstützte Programmiersprachen:**
- Python (Primary)
- Bash
- JavaScript

**Nutzung:** Ermöglicht Data Scientists und Ingenieuren die Durchführung von:
- Live-Datenanalysen
- Frequenz-Auswertungen (DSP - Digital Signal Processing)
- Visualisierung von 3D-Sensorfusions-Daten in Echtzeit

**Jupyter-Lab Zugriff:**
```
https://notebook.qloud-gp.local/lab/proxy/8888
```

**Authentifizierung:**
- Token-basierte Authentifizierung
- OAuth2 Integration
- Local Vault Key für sensitive Operationen

---

### 5. KI-Inferenz Node (`inference.edge.llm`)

**Tunnel-Konfiguration:** Lokaler HTTP/2- oder gRPC-Server mit externem Tunnel-Zugriff für Remote-Abfragen.

**Modell-Backend:**
- **Modell:** Llama-3.1-3B
- **Quantisierung:** Q4_K_M / int8
- **Embedding Engine:** FastEmbed
- **Vector Database:** sqlite-vec

**Funktion:** 
- Verarbeitet semantische Suchanfragen im lokalen RAG-Vault
- Steuert automatisierte Agenten-Loops (LangGraph)
- **Keine Datenabfluss** an externe Cloud-Anbieter (vollständig lokal)

**Inference API Beispiel:**
```bash
curl -X POST \
  https://inference.qloud-gp.local/v1/chat/completions \
  -H "Authorization: Bearer YOUR_LOCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Analysiere die Sensordaten der letzten 24 Stunden"}
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'
```

---

## Sicherheitsübersicht

| Node | Authentifizierung | Verschlüsselung | Besonderheiten |
| --- | --- | --- | --- |
| **MCP** | Hardware-Token (Honeywell) | TLS 1.3 | Akku-basierter Root-of-Trust |
| **API** | Bearer Token | AES-256 | RBAC + SIL-Level Prüfungen |
| **Web-Hook** | HMAC-SHA256 Signature | TLS | Signature Verification |
| **Notebook** | Token + OAuth2 | TLS + Vault | Local Key Management |
| **KI-Inferenz** | Local GPG / Vault | Int8 Quantisierung | 100% lokale Datenverarbeitung |

---

## Integration und Verwendung

### TypeScript/JavaScript Integration

```typescript
import { 
  getAllNodeConfigs, 
  validateNodeEndpoint,
  ENTERPRISE_NODES 
} from '../src/config/enterprise-nodes';

// Alle Nodes abrufen
const allNodes = getAllNodeConfigs();

// Spezifischen Node validieren
await validateNodeEndpoint('MCP');

// API-Node konfiguration
const apiNode = ENTERPRISE_NODES['API'];
console.log(`Connecting to BMS API: ${apiNode.endpointUrl}`);
```

### CSV Export

Die Enterprise Node Database ist auch als CSV-Format verfügbar unter:
```
config/enterprise-nodes.csv
```

Diese kann für Integration mit anderen Tools (Monitoring, Dashboards, IaC) verwendet werden.

---

## Versionshistorie und Updates

- **2026-08-09:** Initiale Erstellung der Enterprise Node Database
- Alle 5 primären Knoten vollständig konfiguriert und dokumentiert

---

## Support & Dokumentation

Für weitere Informationen zu den einzelnen Nodes und deren APIs verweisen Sie auf:
- MCP Protocol: [Model Context Protocol Specification](https://modelcontextprotocol.io)
- Jupyter Notebook: [Official Documentation](https://jupyter.org)
- Llama Models: [Meta Llama](https://www.meta.com/research/publications/llama-models/)
