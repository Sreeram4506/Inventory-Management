import { jsPDF } from 'jspdf';
import fs from 'fs';

const doc = new jsPDF();
const pageWidth = doc.internal.pageSize.getWidth();
const margin = 20;
let cursorY = 20;

const addText = (text, size = 12, style = 'normal', color = [0, 0, 0]) => {
  doc.setFontSize(size);
  doc.setFont('helvetica', style);
  doc.setTextColor(color[0], color[1], color[2]);
  
  const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
  doc.text(lines, margin, cursorY);
  cursorY += (lines.length * size * 0.5) + 5;
  
  if (cursorY > 270) {
    doc.addPage();
    cursorY = 20;
  }
};

const addTitle = (text) => addText(text, 22, 'bold', [0, 0, 0]);
const addHeading = (text) => addText(text, 16, 'bold', [22, 163, 74]); // Profit Green
const addSubHeading = (text) => addText(text, 12, 'bold', [75, 85, 99]);

addTitle('AutoProfitHub: Platform Walkthrough');
cursorY += 5;

addText('Your state-of-the-art dealership management and document automation platform.');
cursorY += 10;

addHeading('1. Login Credentials');
addText('Use the following default accounts to explore the system:');
addText('• Administrator: admin@gmail.com / password123');
addText('• Manager: manager@gmail.com / password123');
addText('• Staff: staff@gmail.com / password123');
cursorY += 5;

addHeading('2. Intelligence Dashboard');
addText('• Live Performance Tracking: Total Revenue, Net Profit, and unit sales.');
addText('• Visual Analytics: Interactive charts for revenue trends and inventory distribution.');
addText('• Real-time Sync: Live indicators ensure data consistency across the team.');
cursorY += 5;

addHeading('3. Automated PDF Workflow');
addText('• Used Vehicle Records: Auto-extraction from purchase documents to fill standardized PDF forms.');
addText('• Mark as Sold: Auto-generate disposition records from Bill of Sale uploads.');
addText('• Registry: Permanent, searchable archive of every generated document.');
cursorY += 5;

addHeading('4. Financial & Expense Tracking');
addText('• Profit Analysis: Detailed tracking of purchase price, repairs, and sales.');
addText('• Expense Management: Log operational costs for true net profit visibility.');
cursorY += 5;

addHeading('5. Administrative Team Management');
addText('• Secure Access: Create and manage unique logins for all staff tiers.');
addText('• Performance Monitoring: Track productivity and sales across your entire team.');
cursorY += 5;

addHeading('6. Premium User Experience');
addText('• Modern UI: Clean, high-contrast light theme optimized for professional use.');
addText('• Mobile-Ready: Full management capabilities on the go.');

const pdfData = doc.output('arraybuffer');
fs.writeFileSync('walkthrough.pdf', Buffer.from(pdfData));
console.log('walkthrough.pdf has been generated successfully.');
