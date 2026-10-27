require('dotenv').config();
const readline = require('node:readline');
const { createInterface } = require('node:readline/promises');
const { connectDB, getStorageMode } = require('../src/config/db');
const User = require('../src/models/User');

const prompt = (rl, label) => rl.question(label);

function promptPassword(label) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('Dispatcher setup requires an interactive terminal.'));
      return;
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(label);
    let value = '';

    const finish = password => {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdout.write('\n');
      resolve(password);
    };
    const onKeypress = (character, key) => {
      if (key?.ctrl && key.name === 'c') {
        process.stdin.removeListener('keypress', onKeypress);
        process.stdin.setRawMode(false);
        reject(new Error('Cancelled.'));
      } else if (key?.name === 'return' || key?.name === 'enter') {
        finish(value);
      } else if (key?.name === 'backspace') {
        value = value.slice(0, -1);
      } else if (character && !key?.ctrl && !key?.meta) {
        value += character;
      }
    };

    process.stdin.on('keypress', onKeypress);
  });
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const name = (await prompt(rl, 'Dispatcher name: ')).trim();
    const email = (await prompt(rl, 'Dispatcher email: ')).trim().toLowerCase();
    rl.close();
    const password = await promptPassword('Password (minimum 12 characters): ');

    if (!name || !email || !email.includes('@') || password.length < 12) {
      throw new Error('Provide a name, valid email, and password with at least 12 characters.');
    }

    await connectDB();
    if (getStorageMode() !== 'mongodb') {
      throw new Error('MongoDB must be configured; dispatcher accounts are not created in demo memory.');
    }
    if (await User.exists({ email })) {
      throw new Error('An account already uses that email address.');
    }

    const user = await User.create({ name, email, password, role: 'dispatcher' });
    console.log(`Dispatcher account created for ${user.email}. Sign in at /login.`);
  } finally {
    rl.close();
    await require('mongoose').disconnect();
  }
}

main().catch(error => {
  console.error(`Dispatcher setup failed: ${error.message}`);
  process.exitCode = 1;
});
