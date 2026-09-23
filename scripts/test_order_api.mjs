// Test script to verify vendor order creation end-to-end
const API_BASE = "http://localhost:4000/api/v1";

async function run() {
  console.log("1. Authenticating as Cafe Admin...");
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId: "ORG-0001",
      email: "pradeeshk331@gmail.com",
      password: "PRADEESHK@94309",
      role: "PRIMARY_MASTER",
      device: {
        deviceId: "dev_test_123",
        deviceName: "Test Chrome",
        deviceType: "DESKTOP",
        operatingSystem: "Windows",
        browser: "Chrome"
      }
    })
  });
  const loginData = await loginRes.json();
  if (!loginData.success) {
    console.error("Login failed:", loginData);
    process.exit(1);
  }
  const token = loginData.data?.token || loginData.token;
  console.log("✓ Logged in successfully. Token received.");

  console.log("\n2. Fetching active vendors...");
  const vRes = await fetch(`${API_BASE}/vendors`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const vData = await vRes.json();
  const vendors = vData.data?.vendors || [];
  console.log(`✓ Fetched ${vendors.length} vendors.`);
  if (vendors.length === 0) {
    console.error("No vendors found!");
    process.exit(1);
  }
  const vendor = vendors[0];
  console.log(`Selected Vendor: ${vendor.name} (${vendor.vendorId})`);

  console.log("\n3. Placing vendor replenishment order (Pillar 1)...");
  const today = new Date().toISOString().slice(0, 10);
  const orderPayload = {
    cafeId: "ZC-0001",
    vendorId: vendor.vendorId,
    vendorName: vendor.name,
    timingType: "SAME_DAY",
    deliveryDate: today,
    lineItems: [
      {
        itemId: "ITEM-1001",
        itemName: "Full Cream Milk (5L)",
        unit: "L",
        quantity: 10,
        ratePaisa: 5800,
        taxPercent: 5,
        hsnCode: "0401",
        notes: "Test replenishment"
      }
    ],
    notes: "Urgent morning delivery for espresso bar",
    priority: "HIGH"
  };

  const orderRes = await fetch(`${API_BASE}/procurement/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(orderPayload)
  });
  const orderResult = await orderRes.json();
  console.log("Order response status:", orderRes.status);
  console.log("Order response body:", JSON.stringify(orderResult, null, 2));

  if (!orderResult.success) {
    console.error("Order creation failed!");
    process.exit(1);
  }

  console.log("\n✓ SUCCESS: Order placed successfully!");
  console.log(`PO Number: ${orderResult.data?.order?.poNumber || orderResult.data?.order?.purchaseOrderId}`);
  console.log(`Status: ${orderResult.data?.order?.status}`);
  console.log(`Lifecycle Stage: ${orderResult.data?.order?.lifecycleStage}`);
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
