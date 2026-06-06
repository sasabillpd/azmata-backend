const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const sendResetEmail = async (toEmail, resetToken, userName) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  await transporter.sendMail({
    from: `"Azmata Cookies" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Reset Kata Sandi - Azmata Cookies',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="max-width:480px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          
          <!-- Header -->
          <div style="background:#064e3b;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:white;font-size:22px;font-weight:600;letter-spacing:-0.5px;">
              Azmata <em style="color:#6ee7b7;">Cookies</em>
            </h1>
          </div>

          <!-- Body -->
          <div style="padding:36px 40px;">
            <div style="width:56px;height:56px;background:#ecfdf5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
              <span style="font-size:24px;">🔑</span>
            </div>

            <h2 style="margin:0 0 8px;text-align:center;font-size:18px;color:#111827;font-weight:600;">
              Reset Kata Sandi
            </h2>
            <p style="margin:0 0 24px;text-align:center;color:#6b7280;font-size:14px;line-height:1.6;">
              Hei ${userName || 'Kak'}! Kami menerima permintaan untuk mereset kata sandi akunmu.
            </p>

            <!-- Button -->
            <div style="text-align:center;margin:28px 0;">
              <a href="${resetUrl}"
                style="display:inline-block;background:#065f46;color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:600;letter-spacing:0.2px;">
                Reset Kata Sandi
              </a>
            </div>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:20px 0;">
              <p style="margin:0;font-size:12px;color:#166534;line-height:1.6;">
                ⏱ Link ini hanya berlaku selama <strong>15 menit</strong>. Jika kamu tidak meminta reset kata sandi, abaikan email ini — akunmu tetap aman.
              </p>
            </div>

            <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
              Atau salin link ini ke browser:<br>
              <span style="color:#065f46;word-break:break-all;">${resetUrl}</span>
            </p>
          </div>

          <!-- Footer -->
          <div style="border-top:1px solid #f3f4f6;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              © 2024 Azmata Cookies · Pasuruan, Jawa Timur<br>
              Email ini dikirim otomatis, mohon tidak membalas.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
};

module.exports = { sendResetEmail };