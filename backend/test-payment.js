const http = require("http");

// Test 1: Get Users
console.log("🧪 MURPH PAYMENT SYSTEM TEST\n");
console.log("=" .repeat(50));

// Test Login
const testLogin = () => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email: "john@gmail.com" });
    
    const req = http.request({
      hostname: "localhost",
      port: 5000,
      path: "/api/test-login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length
      }
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        console.log("\n1️⃣ TEST LOGIN");
        console.log("Status:", res.statusCode);
        try {
          const json = JSON.parse(body);
          if (json.token) {
            console.log("✅ Token received!");
            console.log("Token:", json.token.substring(0, 50) + "...");
            console.log("User:", json.user);
            resolve(json.token);
          } else {
            console.log("❌ No token:", body);
            reject("No token");
          }
        } catch(e) {
          console.log("Response:", body);
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
};

// Test Get Balance
const testBalance = (token) => {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "localhost",
      port: 5000,
      path: "/api/wallet/balance",
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        console.log("\n2️⃣ TEST WALLET BALANCE");
        console.log("Status:", res.statusCode);
        console.log("Response:", body);
        resolve();
      });
    });
    req.on("error", reject);
    req.end();
  });
};

// Test Create Topup
const testTopup = (token) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ amount: 10 });
    
    const req = http.request({
      hostname: "localhost",
      port: 5000,
      path: "/api/wallet/create-topup",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": data.length
      }
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        console.log("\n3️⃣ TEST CREATE TOPUP INTENT");
        console.log("Status:", res.statusCode);
        console.log("Response:", body);
        resolve();
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
};

// Test Transactions
const testTransactions = (token) => {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "localhost",
      port: 5000,
      path: "/api/wallet/transactions",
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        console.log("\n4️⃣ TEST TRANSACTIONS");
        console.log("Status:", res.statusCode);
        console.log("Response:", body);
        resolve();
      });
    });
    req.on("error", reject);
    req.end();
  });
};

// Run all tests
async function runTests() {
  try {
    const token = await testLogin();
    await testBalance(token);
    await testTopup(token);
    await testTransactions(token);
    
    console.log("\n" + "=".repeat(50));
    console.log("✨ ALL TESTS COMPLETE!");
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err);
  }
}

runTests();
