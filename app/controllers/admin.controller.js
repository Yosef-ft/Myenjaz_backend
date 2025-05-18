const { StatusCodes } = require("http-status-codes");
const { genSalt, hash, compare } = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../models");
const Sequelize = require("sequelize"); 

// ✅ Register an Admin
async function register(req, res) {
  const { username, email, password, full_name, phone_no, role } = req.body;

  if (!username || !email || !password) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: "Username, email, and password are required" });
  }

  try {
    // Check if admin already exists
    const existingAdmin = await db.Admin.findOne({
      where: {
        [Sequelize.Op.or]: [{ username }, { email }],
      },
    });

    if (existingAdmin) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Username or email already exists" });
    }

    // Hash the password
    const salt = await genSalt(10);
    const hashedPassword = await hash(password, salt);

    // Insert into the database
    await db.Admin.create({
      username,
      email,
      password_hash: hashedPassword,
      full_name,
      phone_no,
      role: role || "admin", // Default role 'admin' if not provided
    });

    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Admin registered successfully" });
  } catch (error) {
    console.error("Registration error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Server error" });
  }
}

// ✅ Login Admin
async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: "Username and password are required" });
  }

  try {
    // Check if the admin exists
    const admin = await db.Admin.findOne({
      where: { username },
    });

    if (!admin) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "Invalid username or password" });
    }

    if (admin.hold_user) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "Your account is on hold, please contact the admin" });
    }

    // Compare passwords
    const validPassword = await compare(password, admin.password_hash);
    if (!validPassword) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "Invalid username or password" });
    }

    // Generate a token with role information
    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res
      .status(StatusCodes.OK)
      .json({ 
        message: "Login successful", 
        token, 
        username: admin.username,
        role: admin.role
      });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Server error" });
  }
}

// ✅ Hold User
async function holdUser(req, res) {
  const { username } = req.body;

  try {
    // Check if the admin exists
    const admin = await db.Admin.findOne({
      where: { username },
    });

    if (!admin) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Admin not found" });
    }

    if (admin.hold_user) {
      await admin.update({ hold_user: false });
      return res
        .status(StatusCodes.OK)
        .json({ message: "User unheld successfully" });
    } else {
      await admin.update({ hold_user: true });
      return res
        .status(StatusCodes.OK)
        .json({ message: "User held successfully" });
    }

  } catch (error) {
    console.error("Error holding user:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Server error" });
  }
}


// ✅ Delete Admin
async function deleteAdmin(req, res) {
  const adminIdToDelete = parseInt(req.params.id); // Admin to delete
  const loggedInAdminId = parseInt(req.user.id); // From auth middleware
  const loggedInAdminRole = req.user.role; // From auth middleware

  try {
    // Check if the admin exists
    const admin = await db.Admin.findOne({
      where: { id: adminIdToDelete },
    });

    if (!admin) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Admin not found" });
    }

    // Admins cannot delete their own account
    if (loggedInAdminId === adminIdToDelete) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "Admins cannot delete their own account" });
    }

    // Check if logged-in admin has sufficient privileges
    if (loggedInAdminRole !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "Insufficient permissions to delete admin" });
    }

    // Delete the admin
    await db.Admin.destroy({
      where: { id: adminIdToDelete },
    });

    return res
      .status(StatusCodes.OK)
      .json({ message: "Admin account deleted successfully" });
  } catch (error) {
    console.error("Error deleting admin:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong, please try again later" });
  }
}

// ✅ Logout Admin (Frontend handles token removal)
async function logout(req, res) {
  try {
    return res
      .status(StatusCodes.OK)
      .json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Server error" });
  }
}

// ✅ Check Admin Authentication
const check = (req, res) => {
  if (!req.user) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
  }
  return res.status(StatusCodes.OK).json({ user: req.user });
};


// ✅ Get All Admins
async function getAllAdmins(req, res) {
  try {
    const admins = await db.Admin.findAll({
      attributes: ['id', 'username', 'email', 'full_name', 'phone_no','hold_user', 'role'],
      order: [['created_at', 'DESC']]
    });

    // return res.status(StatusCodes.OK).json(admins);

    if (req.user.role === 'admin'){
      return res.status(StatusCodes.OK).json(admins);
    }
    else if (req.user.role === "sub admin") {
      const filteredAdmins = admins.filter(
        (admin) => admin.username === req.user.username
      );
      return res.status(StatusCodes.OK).json(filteredAdmins);
    } else {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "Unauthorized access" });
    }    

  } catch (error) {
    console.error("Error fetching admins:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Server error" });
  }
}

// ✅ Change Password
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const adminId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: "Current password and new password are required" });
  }

  try {
    // Get the admin
    const admin = await db.Admin.findOne({
      where: { id: adminId },
    });

    if (!admin) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Admin not found" });
    }

    // Verify current password
    const validPassword = await compare(currentPassword, admin.password_hash);
    if (!validPassword) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "Current password is incorrect" });
    }

    // Hash and update new password
    const salt = await genSalt(10);
    const hashedPassword = await hash(newPassword, salt);
    await admin.update({ password_hash: hashedPassword });

    return res
      .status(StatusCodes.OK)
      .json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Server error" });
  }
}


module.exports = { 
  register, 
  login, 
  logout, 
  check, 
  deleteAdmin,
  getAllAdmins,
  changePassword,
  holdUser
}; 