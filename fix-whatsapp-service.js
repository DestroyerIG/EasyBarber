// Script para verificarAndFixar o erro de sintaxe
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend/src/services/whatsappService.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Remove as linhas duplicadas/malformadas
content = content.replace(
  `  const appointmentIndex = parseInt(choice) - 1;
    const config = await getBotConfig(barbershopId);
    return { message: formatMessage(config.welcome_message, { barbershopName }) };
  }

  if (!data.appointments`,
  `  const appointmentIndex = parseInt(choice) - 1;

  if (!data.appointments`
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ Erro de sintaxe corrigido!');
