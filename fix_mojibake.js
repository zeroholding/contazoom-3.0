const fs = require('fs');
const path = require('path');

const replacements = {
  'Ã¡': 'á',
  'Ã¢': 'â',
  'Ã£': 'ã',
  'Ã§': 'ç',
  'Ã©': 'é',
  'Ãª': 'ê',
  'Ã­': 'í',
  'Ã³': 'ó',
  'Ã´': 'ô',
  'Ãµ': 'õ',
  'Ãº': 'ú',
  'Ã€': 'À',
  'Ã ': 'à',
  'Ã‰': 'É',
  'ÃŠ': 'Ê',
  'Ã\x8D': 'Í',
  'Ã“': 'Ó',
  'Ã”': 'Ô',
  'Ãš': 'Ú',
  'Ã‡': 'Ç',
  'Ãƒ': 'Ã'
};

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let modifiedCount = 0;

walkDir('./src', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    for (const [bad, good] of Object.entries(replacements)) {
      content = content.split(bad).join(good);
    }
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed ${filePath}`);
      modifiedCount++;
    }
  }
});

console.log(`Total files fixed: ${modifiedCount}`);
