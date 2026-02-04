const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer.middleware");
const { register, login } = require("../controller/Auth.controllers");

router.post("/register", upload.single("image"), register);
router.post("/login", upload.single("image"), login);

module.exports = router;
