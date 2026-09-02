/**
 * @fileoverview File Generation & Export Utilities (Excel, Docx)
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

const FileUtils = {
    /**
     * Generates and downloads an Excel file from a JSON array.
     * @param {Array} data - Array of objects to export.
     * @param {string} fileName - Name of the file (without extension).
     */
    exportToExcel(data, fileName = 'report') {
        if (!window.XLSX) {
            console.error('XLSX library not loaded');
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        
        // Style adjustments could go here if using a styled version of XLSX,
        // but for the standard version we keep it simple.
        
        const cleanFileName = String(fileName || 'report').replace(/(\.xlsx)+$/i, '');
        XLSX.writeFile(workbook, `${cleanFileName}.xlsx`);
    },

    /**
     * Generates and downloads a Word file from a structured object.
     * @param {Object} content - { title: string, sections: [{heading: string, text: string}] }
     * @param {string} fileName - Name of the file (without extension).
     */
    async exportToWord(content, fileName = 'document') {
        if (!window.docx) {
            console.error('docx library not loaded');
            return;
        }

        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;

        // Defensive checks
        if (!content) content = { title: 'مستند بدون عنوان', sections: [] };
        if (!content.title) content.title = 'مستند بدون عنوان';
        if (!Array.isArray(content.sections)) content.sections = [];

        const children = [
            new Paragraph({
                text: content.title,
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
            }),
        ];

        content.sections.forEach(section => {
            if (!section) return;
            children.push(new Paragraph({
                text: section.heading,
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400 },
            }));
            
            if (Array.isArray(section.text)) {
                section.text.forEach(line => {
                    children.push(new Paragraph({
                        children: [new TextRun(line)],
                    }));
                });
            } else {
                children.push(new Paragraph({
                    children: [new TextRun(section.text)],
                }));
            }
        });

        const doc = new Document({
            sections: [{ 
                properties: {}, 
                children: children 
            }],
        });

        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const cleanFileName = String(fileName || 'document').replace(/(\.docx)+$/i, '');
        link.download = `${cleanFileName}.docx`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
};

if (typeof window !== 'undefined') {
    window.FileUtils = FileUtils;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileUtils;
}
