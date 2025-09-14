// Script to update our application with local team logos
// This replaces external logo URLs with local ones

const fs = require('fs');
const path = require('path');

// Team data with local logo paths
const localTeamData = {
  'sprout': {
    name: 'Sprout',
    logoUrl: './logos/sprout.png',
    colorPrimary: '#34bc6e',
    colorSecondary: '#726180',
    source: 'local'
  },
  'red reserve': {
    name: 'Red Reserve', 
    logoUrl: './logos/red-reserve.png',
    colorPrimary: '#da1e28',
    colorSecondary: '#cc666b',
    source: 'local'
  },
  'windigo': {
    name: 'Windigo',
    logoUrl: './logos/windigo.png', 
    colorPrimary: '#7732bb',
    colorSecondary: '#5e6868',
    source: 'local'
  },
  'x6tence': {
    name: 'x6tence',
    logoUrl: './logos/x6tence.png',
    colorPrimary: '#c22dd5', 
    colorSecondary: '#473793',
    source: 'local'
  },
  'ago': {
    name: 'AGO',
    logoUrl: './logos/ago.png',
    colorPrimary: '#dc267f',
    colorSecondary: '#726180', 
    source: 'local'
  },
  'navi': {
    name: 'NAVI',
    logoUrl: './logos/navi.png',
    colorPrimary: '#ffd700',
    colorSecondary: '#000000',
    source: 'local'
  },
  'g2': {
    name: 'G2 Esports',
    logoUrl: './logos/g2.png',
    colorPrimary: '#000000',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  'faze': {
    name: 'FaZe Clan',
    logoUrl: './logos/faze.png',
    colorPrimary: '#000000',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  'astralis': {
    name: 'Astralis',
    logoUrl: './logos/astralis.png',
    colorPrimary: '#ff0000',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  'vitality': {
    name: 'Team Vitality',
    logoUrl: './logos/vitality.png',
    colorPrimary: '#ffd700',
    colorSecondary: '#000000',
    source: 'local'
  },
  'liquid': {
    name: 'Team Liquid',
    logoUrl: './logos/liquid.png',
    colorPrimary: '#0066cc',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  'cloud9': {
    name: 'Cloud9',
    logoUrl: './logos/cloud9.png',
    colorPrimary: '#0066cc',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  'fnatic': {
    name: 'Fnatic',
    logoUrl: './logos/fnatic.png',
    colorPrimary: '#ff6600',
    colorSecondary: '#000000',
    source: 'local'
  },
  'nip': {
    name: 'Ninjas in Pyjamas',
    logoUrl: './logos/nip.png',
    colorPrimary: '#000000',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  '1win': {
    name: '1WIN',
    logoUrl: './logos/1win.png',
    colorPrimary: '#ff0000',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  'bestia': {
    name: 'Bestia',
    logoUrl: './logos/bestia.png',
    colorPrimary: '#8b5cf6',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  'fluxo': {
    name: 'Fluxo',
    logoUrl: './logos/fluxo.png',
    colorPrimary: '#00d4aa',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  'players': {
    name: 'Players',
    logoUrl: './logos/players.png',
    colorPrimary: '#3b82f6',
    colorSecondary: '#ffffff',
    source: 'local'
  },
  'y5': {
    name: 'Y5',
    logoUrl: './logos/y5.png',
    colorPrimary: '#f59e0b',
    colorSecondary: '#000000',
    source: 'local'
  }
};

// Update the React app with local logos
function updateReactApp() {
  const appPath = './src/App.js';
  
  if (fs.existsSync(appPath)) {
    let content = fs.readFileSync(appPath, 'utf8');
    
    // Replace the knownTeams object with local data
    const startMarker = 'const knownTeams = {';
    const endMarker = '};';
    
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker, startIndex) + endMarker.length;
    
    if (startIndex !== -1 && endIndex !== -1) {
      const newTeamData = 'const knownTeams = ' + JSON.stringify(localTeamData, null, 2) + ';';
      content = content.substring(0, startIndex) + newTeamData + content.substring(endIndex);
      
      fs.writeFileSync(appPath, content);
      console.log('✅ Updated React app with local logos');
    }
  }
}

// Update the vanilla JS app with local logos  
function updateVanillaApp() {
  const appPath = './app.js';
  
  if (fs.existsSync(appPath)) {
    let content = fs.readFileSync(appPath, 'utf8');
    
    // This would need to be updated based on the actual structure
    console.log('ℹ️  Vanilla JS app update would go here');
  }
}

// Create a simple logo placeholder generator
function createLogoPlaceholders() {
  const logosDir = './logos';
  
  if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
  }
  
  // Create placeholder files for each team
  Object.entries(localTeamData).forEach(([key, team]) => {
    const fileName = team.logoUrl.replace('./logos/', '');
    const placeholderPath = path.join(logosDir, fileName);
    
    if (!fs.existsSync(placeholderPath)) {
      // Create a simple placeholder file
      fs.writeFileSync(placeholderPath, `<!-- Placeholder for ${team.name} logo -->`);
      console.log(`📁 Created placeholder: ${fileName}`);
    }
  });
}

// Main execution
console.log('🚀 Updating application with local logos...');
createLogoPlaceholders();
updateReactApp();
updateVanillaApp();
console.log('✅ Local logo system ready!');
console.log('📝 Next steps:');
console.log('   1. Download actual logo images to ./logos/ directory');
console.log('   2. Replace placeholder files with real PNG images');
console.log('   3. Test the application with local logos');
