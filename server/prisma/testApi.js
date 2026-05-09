import dotenv from 'dotenv';
dotenv.config();

const API = 'http://localhost:3001/api';

async function test() {
  console.log('--- TESTING API ---');
  
  // Login
  const loginResp = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'password123' })
  });
  
  if (!loginResp.ok) {
    const txt = await loginResp.text();
    console.error('Login Failed:', loginResp.status, txt);
    return;
  }
  
  const { token } = await loginResp.json();
  console.log('Login Success. Token acquired.');
  
  // Get Vehicles
  const vResp = await fetch(`${API}/vehicles`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!vResp.ok) {
    const txt = await vResp.text();
    console.error('Get Vehicles Failed:', vResp.status, txt);
  } else {
    const data = await vResp.json();
    console.log('Get Vehicles Success:', data.length, 'vehicles');
  }
}

test();
