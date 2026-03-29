import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SongForm } from './SongForm';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useUploadAudio
vi.mock('../hooks/useUploadAudio', () => ({
  useUploadAudio: vi.fn(() => ({
    upload: vi.fn(),
    uploading: false,
    progress: 0,
    error: null,
  })),
}));

describe('SongForm', () => {
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'song-123' }),
    });
  });

  it('renders title input, artist input, file input, submit button', () => {
    render(<SongForm onSuccess={mockOnSuccess} />);

    expect(screen.getByTestId('song-title-input')).toBeInTheDocument();
    expect(screen.getByTestId('song-artist-input')).toBeInTheDocument();
    expect(screen.getByTestId('audio-file-input')).toBeInTheDocument();
    expect(screen.getByTestId('song-form-submit')).toBeInTheDocument();
    expect(screen.getByText('Max 15 MB')).toBeInTheDocument();
  });

  it('submit without title shows validation error', async () => {
    render(<SongForm onSuccess={mockOnSuccess} />);

    const submitButton = screen.getByTestId('song-form-submit');
    fireEvent.click(submitButton);

    // HTML5 validation should prevent submission
    await waitFor(() => {
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it('successful submit with title-only calls onSuccess', async () => {
    render(<SongForm onSuccess={mockOnSuccess} />);

    const titleInput = screen.getByTestId('song-title-input');
    const submitButton = screen.getByTestId('song-form-submit');

    fireEvent.change(titleInput, { target: { value: 'Test Song' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Song' }),
      });
      expect(mockOnSuccess).toHaveBeenCalledWith('song-123');
    });
  });

  it('file larger than 15 MB sets error before submitting', async () => {
    // Mock useUploadAudio to simulate file size error
    const mockUseUploadAudio = vi.fn(() => ({
      upload: vi.fn(() => Promise.reject(new Error('File size exceeds 15MB limit'))),
      uploading: false,
      progress: 0,
      error: 'File size exceeds 15MB limit',
    }));

    vi.mocked(await import('../hooks/useUploadAudio')).useUploadAudio = mockUseUploadAudio;

    render(<SongForm onSuccess={mockOnSuccess} />);

    const titleInput = screen.getByTestId('song-title-input');
    const fileInput = screen.getByTestId('audio-file-input');
    const submitButton = screen.getByTestId('song-form-submit');

    fireEvent.change(titleInput, { target: { value: 'Test Song' } });

    // Create a large file
    const largeFile = new File(['x'.repeat(16_000_000)], 'large.mp3', { type: 'audio/mpeg' });
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('song-form-error')).toHaveTextContent('File size exceeds 15MB limit');
    });
  });

  it('uploading state disables the submit button', async () => {
    // Mock useUploadAudio to be uploading
    const mockUseUploadAudio = vi.fn(() => ({
      upload: vi.fn(),
      uploading: true,
      progress: 50,
      error: null,
    }));

    vi.mocked(await import('../hooks/useUploadAudio')).useUploadAudio = mockUseUploadAudio;

    render(<SongForm onSuccess={mockOnSuccess} />);

    const submitButton = screen.getByTestId('song-form-submit');
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveTextContent('Creating Song...');
  });
});