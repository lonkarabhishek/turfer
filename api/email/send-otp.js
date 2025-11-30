const { Resend } = require('resend');
const { generateOTP, storeOTP } = require('../../lib/emailOtpManager.cjs');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP
    storeOTP(email, otp);

    console.log(`📧 Sending OTP to ${email}: ${otp}`);

    // Send email via Resend
    const { data, error } = await resend.emails.send({
      from: 'TapTurf <noreply@tapturf.in>',
      to: [email],
      subject: 'Your TapTurf Verification Code',
      html: `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>TapTurf Email Verification</title>
          </head>
          <body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:32px 16px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
                    <tr>
                      <td align="center" style="padding:32px 24px;">
                        <h1 style="margin:0;font-size:24px;color:#16a34a;">TapTurf Email Verification</h1>
                        <p style="margin:16px 0;font-size:16px;color:#374151;">
                          Your verification code is:
                        </p>
                        <div style="background:#f3f4f6;border-radius:8px;padding:20px;margin:24px 0;">
                          <p style="margin:0;font-size:32px;font-weight:bold;color:#16a34a;letter-spacing:8px;text-align:center;">
                            ${otp}
                          </p>
                        </div>
                        <p style="margin:16px 0;font-size:14px;color:#6b7280;">
                          This code will expire in <strong>5 minutes</strong>.
                        </p>
                        <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
                          If you didn't request this code, you can safely ignore this email.
                        </p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
                    © TapTurf • <a href="https://tapturf.in" style="color:#16a34a;text-decoration:none;">tapturf.in</a>
                  </p>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification email'
      });
    }

    console.log(`✅ Email sent successfully to ${email}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully'
    });

  } catch (error) {
    console.error('Send email OTP error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
