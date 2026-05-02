import dotenv from "dotenv";
dotenv.config();

const config = {
  baseUrl: process.env.BASE_URL || "http://20.207.122.201/evaluation-service",
  email: process.env.EMAIL || "",
  name: process.env.NAME || "",
  rollNo: process.env.ROLL_NO || "",
  mobileNo: process.env.MOBILE_NO || "",
  githubUsername: process.env.GITHUB_USERNAME || "",
  accessCode: process.env.ACCESS_CODE || "",
  clientId: process.env.CLIENT_ID || "",
  clientSecret: process.env.CLIENT_SECRET || "",
  authToken: process.env.AUTH_TOKEN || "",
  port: parseInt(process.env.PORT || "3000"),
};

export default config;
