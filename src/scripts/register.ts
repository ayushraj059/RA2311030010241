/**
 * Run this ONCE to get your clientID and clientSecret.
 * Command: npm run register
 *
 * IMPORTANT: Save the output - you cannot register twice.
 */

import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BASE = process.env.BASE_URL || "http://20.207.122.201/evaluation-service";

async function register() {
  console.log("Registering...\n");

  try {
    const res = await axios.post(`${BASE}/register`, {
      email: process.env.EMAIL,
      name: process.env.NAME,
      mobileNo: process.env.MOBILE_NO,
      githubUsername: process.env.GITHUB_USERNAME,
      rollNo: process.env.ROLL_NO,
      accessCode: process.env.ACCESS_CODE,
    });

    console.log("Registration successful!\n");
    console.log("Copy these into your .env file:");
    console.log("CLIENT_ID=" + res.data.clientID);
    console.log("CLIENT_SECRET=" + res.data.clientSecret);
    console.log("\nFull response:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("Registration failed:", err?.response?.data || err.message);
  }
}

register();
