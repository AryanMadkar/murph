const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer
 * @param {string} originalName
 * @param {string} mimeType
 * @param {string} folder
 * @returns {Promise<string>} S3 Object URL (or Key)
 */
const uploadToS3 = async (
  fileBuffer,
  originalName,
  mimeType,
  folder = "materials",
) => {
  const extension = path.extname(originalName);
  const key = `${folder}/${uuidv4()}${extension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  // Return the public URL or the key depending on bucket policy
  // Often it's better to return the Key and use getSignedUrl for private access
  return key;
};

/**
 * Generate a signed URL for a private S3 object
 * @param {string} key
 * @param {number} expiresIn Seconds
 * @returns {Promise<string>}
 */
const getSignedDownloadUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};

module.exports = {
  s3Client,
  uploadToS3,
  getSignedDownloadUrl,
};
