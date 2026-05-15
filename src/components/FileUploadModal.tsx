import React, { useRef, useState } from 'react';
import { Upload, File, X, AlertTriangle, CheckCircle } from 'lucide-react';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload: (domains: string[]) => void;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({ 
  isOpen, 
  onClose, 
  onFileUpload 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
    count?: number;
  }>({ type: null, message: '' });

  if (!isOpen) return null;

  const processDomains = (content: string) => {
    const domains = content
      .split(/[\n,;]/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(domain => {
        // Clean up domain format
        return domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
      })
      .filter(domain => {
        // Basic domain validation
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.([a-zA-Z]{2,}|[a-zA-Z]{2,}\.[a-zA-Z]{2,})$/;
        return domainRegex.test(domain);
      });

    // Remove duplicates
    const uniqueDomains = [...new Set(domains)];
    
    return {
      domains: uniqueDomains,
      originalCount: content.split(/[\n,;]/).filter(line => line.trim().length > 0).length,
      validCount: uniqueDomains.length
    };
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (file.size > 30 * 1024 * 1024) { // 30MB limit
      setUploadStatus({
        type: 'error',
        message: 'File size too large. Please use files smaller than 10MB.'
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const result = processDomains(content);
        
        if (result.domains.length === 0) {
          setUploadStatus({
            type: 'error',
            message: 'No valid domains found in the file. Please check the format.'
          });
          return;
        }

        setUploadStatus({
          type: 'success',
          message: `Successfully loaded ${result.validCount} unique domains${result.originalCount !== result.validCount ? ` (${result.originalCount - result.validCount} duplicates/invalid removed)` : ''}.`,
          count: result.validCount
        });

        // Auto-close after successful upload
        setTimeout(() => {
          onFileUpload(result.domains);
        }, 1500);
        
      } catch (error) {
        setUploadStatus({
          type: 'error',
          message: 'Error reading file. Please try again.'
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const resetStatus = () => {
    setUploadStatus({ type: null, message: '' });
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Upload className="w-6 h-6 text-cyan-400" />
            Upload Domains
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white/60 hover:text-white" />
          </button>
        </div>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          
          {/* Upload Status */}
          {uploadStatus.type && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              uploadStatus.type === 'success' 
                ? 'bg-emerald-500/20 border-emerald-400/30' 
                : 'bg-red-500/20 border-red-400/30'
            }`}>
              {uploadStatus.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={`text-sm font-medium ${
                  uploadStatus.type === 'success' ? 'text-emerald-300' : 'text-red-300'
                }`}>
                  {uploadStatus.message}
                </p>
                {uploadStatus.type === 'error' && (
                  <button
                    onClick={resetStatus}
                    className="text-xs text-red-400 hover:text-red-300 mt-1 underline"
                  >
                    Try again
                  </button>
                )}
              </div>
            </div>
          )}
          
          {/* Drag & Drop Area */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${
              dragActive 
                ? 'border-cyan-400 bg-cyan-500/10' 
                : 'border-white/30 hover:border-cyan-400/50 hover:bg-white/5'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleClick}
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 transition-colors ${
              dragActive ? 'text-cyan-400' : 'text-white/40'
            }`} />
            <p className="text-white font-medium mb-2">
              {dragActive ? 'Drop your file here' : 'Drag & drop your file here'}
            </p>
            <p className="text-white/60 text-sm mb-4">or click to browse</p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg text-sm">
              <File className="w-4 h-4" />
              Select File (.txt, .csv)
            </div>
          </div>
          
          <div className="bg-cyan-500/20 border border-cyan-400/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <File className="w-5 h-5 text-cyan-300 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-cyan-200">
                <p className="font-medium mb-2">Supported Formats</p>
                <ul className="text-xs text-cyan-300/80 space-y-1 mb-3">
                  <li>• One domain per line</li>
                  <li>• Comma or semicolon separated</li>
                  <li>• With or without http/https</li>
                  <li>• Duplicates will be removed</li>
                </ul>
                <div className="font-mono text-xs bg-white/10 rounded-lg px-3 py-2 border border-white/20 text-white">
                  example.com<br />
                  https://another-site.org<br />
                  third-domain.net<br />
                  <span className="text-white/50">...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};