const nodemailer = require('nodemailer');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('../config');

const sendContactEmail = async ({data}) => {
  const { name, email, inquiry } = data || {};
  if (!name || !email || !inquiry) {
    throw new HttpsError('invalid-argument', 'Name, email and inquiry are required.');
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'info@trendingtechdaily.com',
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: 'info@trendingtechdaily.com',
      to: 'info@trendingtechdaily.com',
      replyTo: email,
      subject: `Contact form submission from ${name}`,
      text: inquiry,
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to send contact email', error);
    throw new HttpsError('internal', 'Failed to send contact email');
  }
};

module.exports = { sendContactEmail };


