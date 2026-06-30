import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function checkDomain() {
  try {
    const { data, error } = await resend.domains.list();
    if (error) {
        console.error('Error listing domains:', error);
        return;
    }
    console.log('Current domains in Resend:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkDomain();
