import React, { useRef } from 'react';
import { Upload, File } from 'lucide-react';

interface FileUploadProps {
  onFileUpload: (domains: string[]) => void;
  disabled?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const domains = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        onFileUpload(domains);
      };
      reader.readAsText(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        onChange={handleFileChange}
        className="hidden"
      />
      
      <button
        onClick={handleClick}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none"
      >
        <Upload className="w-5 h-5" />
        Upload Domain List (.txt)
      </button>
      
      <div className="bg-cyan-500/20 border border-cyan-400/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <File className="w-5 h-5 text-cyan-300 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-cyan-200">
            <p className="font-medium mb-1">File Format</p>
            <p className="text-xs text-cyan-300/80">Upload a .txt file with one domain per line:</p>
            <div className="mt-2 font-mono text-xs bg-white/10 rounded-lg px-3 py-2 border border-white/20 text-white">
              example.com<br />
              another-site.org<br />
              third-domain.net
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};