/**
 * Run this to get your Bearer token after registration.
 * Command: npm run gettoken
 *
 * Copy the AUTH_TOKEN value into your .env file.
 */

import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BASE = process.env.BASE_URL || "http://20.207.122.201/evaluation-service";

async function getToken() {
  if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
    console.error("CLIENT_ID and CLIENT_SECRET not set. Run: npm run register first.");
    process.exit(1);
  }

  try {
    const res = await axios.post(`${BASE}/auth`, {
      email: process.env.EMAIL,
      name: process.env.NAME,
      rollNo: process.env.ROLL_NO,
      accessCode: process.env.ACCESS_CODE,
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
    });

    console.log("Token obtained!\n");
    console.log("Copy this into your .env file:");
    console.log("AUTH_TOKEN=" + res.data.access_token);
    console.log("\nExpires in:", res.data.expires_in);
  } catch (err: any) {
    console.error("Auth failed:", err?.response?.data || err.message);
  }
}

getToken();
