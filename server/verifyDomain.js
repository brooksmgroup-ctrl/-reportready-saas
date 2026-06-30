import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function addDomain() {
  try {
    const { data, error } = await resend.domains.create({
      name: 'getreportready.com',
    });

    if (error) {
      console.error('Error adding domain:', error);
      return;
    }

    console.log('Domain added successfully!');
    console.log('DNS Records to add to GoDaddy:');
    console.table(data.records);
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

addDomain();
