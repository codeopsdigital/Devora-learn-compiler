# Compiler Backend — Frontend Integration Guide

## Base URL

```
http://localhost:5001
```

> Set in `.env` → `PORT=5001`  
> Frontend origin allowed: `http://localhost:3000` (set in `.env` → `CLIENT_URL`)

---

## Overview: How It Works

1. **Frontend submits code** via `POST /api/execute/execute` → gets back a `jobId`
2. **Frontend connects to Socket.IO** and joins the job room using that `jobId`
3. **Backend streams** stdout/stderr chunks in real time via Socket.IO events
4. **Job finishes** → backend emits `job:done` or `job:failed`
5. **Frontend can also poll** `GET /api/jobs/:jobId` at any time for full results

---

## REST API Endpoints

### 1. Submit Code for Execution

```
POST /api/execute/execute
Content-Type: application/json
```

**Request Body:**

| Field      | Type   | Required | Constraints              | Description              |
|------------|--------|----------|--------------------------|--------------------------|
| `code`     | string | Yes      | max 65,536 characters    | Source code to execute   |
| `language` | string | Yes      | `cpp`, `python`, `rust`, `go`, `java` | Programming language |
| `stdin`    | string | No       | max 4,096 characters     | Standard input for program |

**Example Request:**
```json
{
  "code": "#include<iostream>\nint main(){ std::cout << \"Hello World\"; }",
  "language": "cpp",
  "stdin": ""
}
```

**Success Response — `202 Accepted`:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Code execution started"
}
```

**Error Response — `400 Bad Request`** (validation failure):
```json
{
  "error": "\"language\" must be one of [cpp, python, rust, go, java]"
}
```

**Rate Limit:** 20 requests/minute per IP. Exceeding returns `429 Too Many Requests`.

---

### 2. Get Job Status & Results

```
GET /api/jobs/:jobId
```

**Example:**
```
GET /api/jobs/550e8400-e29b-41d4-a716-446655440000
```

**Response — `200 OK`:**
```json
{
  "_id": "...",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "language": "cpp",
  "code": "#include<iostream>...",
  "stdin": "",
  "stdout": "Hello World",
  "stderr": "",
  "exitCode": 0,
  "duration": 1234,
  "status": "done",
  "completedAt": "2024-01-01T00:00:00.000Z",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Job Status Values:**

| Status    | Meaning                                      |
|-----------|----------------------------------------------|
| `queued`  | Job is waiting in queue                      |
| `running` | Code is currently executing                  |
| `done`    | Execution completed (check `exitCode`)       |
| `failed`  | Execution failed (check `stderr`)            |
| `timeout` | Execution exceeded time limit                |

> `exitCode: 0` = success, `exitCode > 0` = runtime error

---

### 3. Get Execution History

```
GET /api/jobs/history
```

Returns last 10 submissions, sorted newest first.

**Response — `200 OK`:**
```json
[
  {
    "jobId": "...",
    "language": "python",
    "status": "done",
    "stdout": "Hello World\n",
    "stderr": "",
    "exitCode": 0,
    "duration": 892,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### 4. Health Check

```
GET /health
```

**Response — `200 OK`:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Real-Time Updates via Socket.IO

### Connect

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5001");
```

### Subscribe to a Job

After getting `jobId` from the execute endpoint, join the job room:

```javascript
socket.emit("join:job", jobId);
```

### Events to Listen For

| Event         | Direction      | Payload                                    | When                          |
|---------------|----------------|---------------------------------------------|-------------------------------|
| `job:queued`  | Server → Client | `{ jobId, status: "queued" }`              | Job accepted into queue       |
| `job:started` | Server → Client | `{ jobId }`                                | Worker begins execution       |
| `job:stdout`  | Server → Client | `{ jobId, chunk: "...output text..." }`    | Program prints output (streamed) |
| `job:stderr`  | Server → Client | `{ jobId, chunk: "...error text..." }`     | Program prints to stderr (streamed) |
| `job:done`    | Server → Client | `{ jobId, exitCode: 0, duration: 1234 }`   | Execution completed           |
| `job:failed`  | Server → Client | `{ jobId, error: "error message" }`        | Execution failed or timed out |

### Full Frontend Integration Example

```javascript
const BASE_URL = process.env.NEXT_PUBLIC_COMPILER_API_URL || "https://devoracamp.duckdns.org";
const socket = io(BASE_URL, {
  transports: ["polling", "websocket"],
  withCredentials: true,
});

async function runCode(language, code, stdin = "") {
  // 1. Submit the job
  const res = await fetch(`${BASE_URL}/api/execute/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, code, stdin }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Submission failed");
  }

  const { jobId } = await res.json();

  // 2. Join the job room for real-time updates
  socket.emit("join:job", jobId);

  let output = "";
  let errorOutput = "";

  return new Promise((resolve, reject) => {
    socket.on("job:stdout", ({ chunk }) => {
      output += chunk;
      // Update your UI here (append to output box)
    });

    socket.on("job:stderr", ({ chunk }) => {
      errorOutput += chunk;
      // Update your UI here (append to error box)
    });

    socket.on("job:done", ({ exitCode, duration }) => {
      cleanup();
      resolve({ output, errorOutput, exitCode, duration });
    });

    socket.on("job:failed", ({ error }) => {
      cleanup();
      reject(new Error(error));
    });

    function cleanup() {
      socket.off("job:stdout");
      socket.off("job:stderr");
      socket.off("job:done");
      socket.off("job:failed");
    }
  });
}

// Usage
try {
  const result = await runCode("python", 'print("Hello World")');
  console.log("Output:", result.output);         // Hello World
  console.log("Exit code:", result.exitCode);    // 0
  console.log("Duration:", result.duration, "ms");
} catch (err) {
  console.error("Error:", err.message);
}
```

---

## Language Reference

| Language | File         | Timeout | Notes                          |
|----------|--------------|---------|--------------------------------|
| `cpp`    | `main.cpp`   | 10s     | Compiled with g++              |
| `python` | `main.py`    | 10s     | Python 3                       |
| `go`     | `main.go`    | 10s     | Compiled with go build         |
| `rust`   | `main.rs`    | 15s     | Compiled with rustc (slower)   |
| `java`   | `Main.java`  | 15s     | Class must be named `Main`     |

> **Java note:** The public class in your Java code **must be named `Main`**.

---

## Execution Constraints (per job)

| Constraint       | Limit         |
|------------------|---------------|
| CPU              | 1 core        |
| Memory           | 256 MB        |
| Processes (PIDs) | 50            |
| Network          | Disabled      |
| Filesystem       | Read-only (except 64MB /tmp) |
| stdout/stderr    | 100 KB max each |

---

## Language Code Samples

### C++ (`cpp`)
```cpp
#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}
```

### Python (`python`)
```python
print("Hello, World!")
```

### Go (`go`)
```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
```

### Rust (`rust`)
```rust
fn main() {
    println!("Hello, World!");
}
```

### Java (`java`)
```java
// Class MUST be named Main
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```

---

## Reading stdin

Pass user input via the `stdin` field. Your program reads it normally:

```json
{
  "language": "python",
  "code": "name = input()\nprint(f'Hello, {name}!')",
  "stdin": "Alice"
}
```

Output: `Hello, Alice!`

---

## Error Interpretation

| Scenario                  | `status`  | `exitCode` | `stderr`         |
|---------------------------|-----------|------------|------------------|
| Successful run            | `done`    | `0`        | empty            |
| Runtime error             | `done`    | `1` or `2` | error message    |
| Compilation error         | `done`    | non-zero   | compiler errors  |
| Time limit exceeded       | `timeout` | -          | timeout message  |
| System/queue failure      | `failed`  | -          | error message    |