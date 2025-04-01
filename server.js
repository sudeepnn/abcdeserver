require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());


const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB"));

// Define User Schema & Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
});

const OSprojectSchema = new mongoose.Schema({
  title: { type: String, required: true },
  discription: { type: String, required: true },
  github: { type: String, required: true },
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

// Function to Send Emails
const sendEmails = async (emails, message, subject) => {
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
    if (!message || !subject) return res.status(400).json({ error: "Message and subject are required" });

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
    const { title, discription, github } = req.body;
    if (!title || !discription || !github) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const newOsproject = new Opensource({ title, discription, github });
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
    const { title, discription, github } = req.body;

    const updatedProject = await Opensource.findByIdAndUpdate(
      req.params.id,
      { title, discription, github },
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


app.post("/api/blogs", async (req, res) => {
  try {
    const { title, description, image, date } = req.body;

    if (!title || !description || !image || !date) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const uploadedImage = await uploadImageToCloudinary(image);

    const newBlog = new Blog({
      title,
      description,
      date: new Date(date), // Convert the date to a Date object
      imageUrl: uploadedImage.secure_url,
    });

    await newBlog.save();
    res.status(201).json({ message: "Blog created successfully!", blog: newBlog });
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

app.put("/api/blogs/:id", async (req, res) => {
  try {
    const { title, description, image, date } = req.body;

    const updatedFields = { title, description, date: new Date(date) }; // Update the date

    if (image) {
      const uploadedImage = await uploadImageToCloudinary(image);
      updatedFields.imageUrl = uploadedImage.secure_url;
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
