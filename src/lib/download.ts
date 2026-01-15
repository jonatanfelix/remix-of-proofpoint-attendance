/**
 * Robust file download utility for handling browser-specific quirks
 * Specifically addresses UUID filename issue in certain browsers
 */

export function downloadBlob(blob: Blob, filename: string): void {
    try {
        // Check for IE/Edge msSaveOrOpenBlob
        const nav = window.navigator as any;
        if (nav.msSaveOrOpenBlob) {
            nav.msSaveOrOpenBlob(blob, filename);
            return;
        }

        // Create object URL from blob
        const url = URL.createObjectURL(blob);

        // Create and configure anchor element
        const anchor = document.createElement('a');
        anchor.style.display = 'none';
        anchor.href = url;
        anchor.download = filename;

        // CRITICAL: Set additional attributes to force download
        anchor.setAttribute('download', filename);
        anchor.setAttribute('target', '_blank');

        // Append to body (required for Firefox)
        document.body.appendChild(anchor);

        // Trigger download
        anchor.click();

        // Cleanup with slight delay to ensure download initiated
        setTimeout(() => {
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        }, 100);

    } catch (error) {
        console.error('Download failed:', error);

        // Final fallback: open in new window
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) {
            setTimeout(() => {
                win.document.title = filename;
                URL.revokeObjectURL(url);
            }, 100);
        }
    }
}
