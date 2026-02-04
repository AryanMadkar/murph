const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer.middleware");
const { register, login } = require("../controller/Auth.controllers");

router.post("/register", register);
router.post("/login", login);

module.exports = router;
