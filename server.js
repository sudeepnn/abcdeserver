require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB"));

// Define User Schema & Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
});

const User = mongoose.model("User", userSchema);

// POST API - Store Email in DB
app.post("/api/users", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const newUser = new User({ email });
    await newUser.save();
    res.status(201).json({ message: "Email saved successfully!", user: newUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET API - Fetch All Emails
app.get("/api/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});


const sendEmails = async (emails, message,subject) => {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      
    });
  
    for (let email of emails) {
      let mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: subject,
        text: message,
      };
  
      await transporter.sendMail(mailOptions);
    }
  };
  
  // API to Send Emails
  app.post("/api/send-mails", async (req, res) => {
    try {
      const { message,subject } = req.body;
      if (!message || !subject) return res.status(400).json({ error: "Message is required" });
  
      const users = await User.find();
      const emailList = users.map(user => user.email);
  
      if (emailList.length === 0) {
        return res.status(400).json({ error: "No emails found in the database" });
      }
  
      await sendEmails(emailList, message,subject);
  
      res.json({ message: "Emails sent successfully!" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
