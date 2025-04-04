require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());


const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "blog_images",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const upload = multer({ storage });


const isValidEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};
// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB"));

const rootUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

rootUserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const ABCDERootUser = mongoose.model("abcderootuser", rootUserSchema);

// Define User Schema & Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
});

const OSprojectSchema = new mongoose.Schema({
  title: { type: String, required: true },
  discription: { type: String, required: true },
  github: { type: String, required: true },
  marker: { type: String, required: true, enum: ["application", "opensource"] }, // Added marker field
});

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  imageUrl: { type: String, required: true },
  date: { type: Date, required:true},
  description: { type: String, required: true },
});

const Blog = mongoose.model("Blog", blogSchema);


const User = mongoose.model("User", userSchema);
const Opensource = mongoose.model("Opensource", OSprojectSchema);


const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Access Denied: No token" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET );
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid Token" });
  }
};

app.post("/api/root/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    const existingUser = await ABCDERootUser.findOne({ username });
    if (existingUser) return res.status(400).json({ message: "Username already exists" });

    const user = new ABCDERootUser({ username, password });
    await user.save();

    res.status(201).json({ message: "Root user created successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login Route
app.post("/api/root/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await ABCDERootUser.findOne({ username });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET , {
      expiresIn: "2h"
    });

    res.status(200).json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST API - Store Email in DB
app.post("/api/users", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Validate Email Format
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const newUser = new User({ email });
    await newUser.save();

    const subject = "Hello, Thanks for Subscribing!";
const message = `
Hello,

We're thrilled to welcome you to ABCDE! 🎉

Here's what you can expect:
✅ Exclusive content tailored for you
✅ Important updates and offers
✅ A community of like-minded individuals

If you have any questions, feel free to reach out.

👉 To unsubscribe, click here: [Unsubscribe Link]

Best regards,  
The ABCDE Team  
`;

    await sendEmails(email, message, subject);

    res.status(201).json({ message: "Email saved successfully!", user: newUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET API - Fetch All Emails
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Function to Send Emails
const sendEmails = async (emails, message, subject) => {
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  if (!Array.isArray(emails)) {
    emails = [emails]; // Convert to an array if a single email is passed
  }

  for (let email of emails) {
    let mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      text: message,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send email to ${email}:`, error.message);
    }
  }
};

// API to Send Emails
app.post("/api/send-mails", async (req, res) => {
  try {
    const { message, subject } = req.body;
    if (!message || !subject) {
      return res.status(400).json({ error: "Message and subject are required" });
    }

    const users = await User.find();
    const emailList = users.map(user => user.email);

    if (emailList.length === 0) {
      return res.status(400).json({ error: "No emails found in the database" });
    }

    await sendEmails(emailList, message, subject);
    res.json({ message: "Emails sent successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Open Source Project - Store Data
app.post("/api/Osproject", async (req, res) => {
  try {
    const { title, discription, github, marker } = req.body;

    if (!title || !discription || !github || !marker) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Ensure marker is either "application" or "opensource"
    if (!["application", "opensource"].includes(marker)) {
      return res.status(400).json({ error: "Marker must be 'application' or 'opensource'" });
    }

    const newOsproject = new Opensource({ title, discription, github, marker });
    await newOsproject.save();

    res.status(201).json({ message: "Project saved successfully!", OSproject: newOsproject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Open Source Project - Get All
app.get("/api/Osproject", async (req, res) => {
  try {
    const projects = await Opensource.find();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/Osproject/marker/:marker", async (req, res) => {
  try {
    const { marker } = req.params;

    // Ensure marker is either "application" or "opensource"
    if (!["application", "opensource"].includes(marker)) {
      return res.status(400).json({ error: "Invalid marker value. Must be 'application' or 'opensource'" });
    }

    const projects = await Opensource.find({ marker });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get("/api/Osproject/:id", async (req, res) => {
  try {
    const project = await Opensource.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.put("/api/Osproject/:id", async (req, res) => {
  try {
    const { title, discription, github, marker } = req.body;

    if (marker && !["application", "opensource"].includes(marker)) {
      return res.status(400).json({ error: "Marker must be 'application' or 'opensource'" });
    }

    const updatedProject = await Opensource.findByIdAndUpdate(
      req.params.id,
      { title, discription, github, marker },
      { new: true, runValidators: true }
    );

    if (!updatedProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ message: "Project updated successfully!", project: updatedProject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.delete("/api/Osproject/:id", async (req, res) => {
  try {
    const deletedProject = await Opensource.findByIdAndDelete(req.params.id);

    if (!deletedProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ message: "Project deleted successfully!", project: deletedProject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



//blogs
const uploadImageToCloudinary = async (imagePath) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(imagePath, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
};


app.post("/api/blogs", upload.single("image"), async (req, res) => {
  try {
    const { title, description, date } = req.body;

    if (!title || !description || !date || !req.file) {
      return res.status(400).json({ error: "All fields are required, including an image." });
    }

    const newBlog = new Blog({
      title,
      description,
      date: new Date(date), // Convert the date to a Date object
      imageUrl: req.file.path, // Cloudinary URL
    });

    await newBlog.save();
    res.status(201).json({ message: "Blog created successfully!", blog: newBlog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/blogs/latest", async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ date: -1 }).limit(3); // sort by date descending and limit to 3
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get("/api/blogs", async (req, res) => {
  try {
    const blogs = await Blog.find();
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/blogs/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }
    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/blogs/:id", upload.single("image"), async (req, res) => {
  try {
    const { title, description, date } = req.body;
    const updatedFields = {};

    if (title) updatedFields.title = title;
    if (description) updatedFields.description = description;
    if (date) updatedFields.date = new Date(date);

    if (req.file) {
      updatedFields.imageUrl = req.file.path; // Already uploaded via Cloudinary
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      req.params.id,
      updatedFields,
      { new: true, runValidators: true }
    );

    if (!updatedBlog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    res.json({ message: "Blog updated successfully!", blog: updatedBlog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.delete("/api/blogs/:id", async (req, res) => {
  try {
    const deletedBlog = await Blog.findByIdAndDelete(req.params.id);

    if (!deletedBlog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    res.json({ message: "Blog deleted successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
