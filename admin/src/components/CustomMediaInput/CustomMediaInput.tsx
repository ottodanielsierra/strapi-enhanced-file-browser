import * as React from 'react';
import { createPortal } from 'react-dom';
import { useFetchClient, useField } from '@strapi/strapi/admin';
import { getNativeMediaField } from '../../utils/nativeMediaField';
import { 
  Trash, 
  GridFour, 
  BulletList, 
  CheckCircle,
  Pencil,
  Folder,
  ArrowRight,
  ArrowLeft,
  File as FileIcon
} from '@strapi/icons';
import { 
  Typography, 
  Button, 
  IconButton, 
  IconButtonGroup, 
  Switch,
  Tooltip,
  Modal,
  Tabs,
  Badge,
  Divider,
  Breadcrumbs,
  Crumb,
  CrumbLink,
  TextButton,
  Loader,
  DesignSystemProvider 
} from '@strapi/design-system';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragCancelEvent, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';

const removeButtonImageGridStyle: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  top: 8,
};

const removeButtonImageListStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  justifyContent: 'flex-start'
};

const cmlLoaderDivStyle: React.CSSProperties = {
  position: 'absolute',
  background: '#ffffffbf',
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1,
}

type AllowedType = 'files' | 'images' | 'videos' | 'audios';
type BrowserTab = 'browser' | 'selected';
type SelectedViewMode = 'list' | 'grid';

type MediaFile = {
  id: number;
  name?: string;
  alternativeText?: string | null;
  caption?: string | null;
  mime?: string;
  url?: string;
  formats?: {
    thumbnail?: {
      url?: string;
    };
    small?: {
      url?: string;
    };
    medium?: {
      url?: string;
    };
  };
};

type FolderItem = {
  id: number;
  name: string;
  path?: string;
  pathId?: string;
};

type FolderBreadcrumbItem = {
  folder: FolderItem;
  isCurrent: boolean;
};

type SelectedAssetCardContentProps = {
  asset: MediaFile;
  index?: number;
  selectedViewMode: SelectedViewMode;
  isDragging?: boolean;
  isOverlay?: boolean;
  onRemove: (id: number) => void;
};

type SortableSelectedAssetCardProps = SelectedAssetCardContentProps & {
  disabled?: boolean;
};

type MediaInputProps = {
  required?: boolean;
  name: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  attribute?: {
    allowedTypes?: AllowedType[];
    multiple?: boolean;
  };
};

type PaginationInfo = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

const DEFAULT_PAGINATION: PaginationInfo = {
  page: 1,
  pageSize: 24,
  pageCount: 1,
  total: 0,
};

const toArray = (value: unknown): MediaFile[] => {
  if (Array.isArray(value)) return value as MediaFile[];
  if (value && typeof value === 'object') return [value as MediaFile];
  return [];
};

const resolveMediaUrl = (rawUrl?: string): string => {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return rawUrl;

  const backend = (window as unknown as { strapi?: { backendURL?: string } }).strapi?.backendURL;
  if (backend) {
    return `${backend.replace(/\/$/, '')}${rawUrl}`;
  }

  return rawUrl;
};

const isAllowedByType = (file: MediaFile, allowedTypes: AllowedType[]) => {
  if (!allowedTypes.length) return true;
  const mime = (file.mime ?? '').toLowerCase();
  if (!mime) return true;

  const checks: Record<AllowedType, boolean> = {
    images: mime.startsWith('image/'),
    videos: mime.startsWith('video/'),
    audios: mime.startsWith('audio/'),
    files: true,
  };

  return allowedTypes.some((type) => checks[type]);
};

const getPreviewUrl = (asset: MediaFile) =>
  resolveMediaUrl(asset.formats?.thumbnail?.url ?? asset.formats?.small?.url ?? asset.formats?.medium?.url ?? asset.url);

const getMediaKind = (asset: MediaFile): 'image' | 'video' | 'audio' | 'file' => {
  const mime = (asset.mime ?? '').toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
};

const selectedIdsToMap = (assets: MediaFile[]) => {
  const map: Record<number, true> = {};
  assets.forEach((asset) => {
    map[asset.id] = true;
  });
  return map;
};

const getFolderPathSegments = (path?: string) => (path ?? '').split('/').map((segment) => segment.trim()).filter(Boolean);

const getFolderPathKey = (folder?: FolderItem | null) => getFolderPathSegments(folder?.path).join('/');

const getCurrentFolder = (selectedFolderId: number | null, folders: FolderItem[]) =>
  selectedFolderId == null ? null : folders.find((folder) => folder.id === selectedFolderId) ?? null;

const getFolderBreadcrumbs = (selectedFolder: FolderItem | null, folders: FolderItem[]) => {
  if (!selectedFolder) {
    return [] as FolderBreadcrumbItem[];
  }

  if (!selectedFolder.path) {
    return [
      {
        folder: selectedFolder,
        isCurrent: true,
      },
    ];
  }

  const segments = getFolderPathSegments(selectedFolder.path);

  return segments.reduce<FolderBreadcrumbItem[]>((acc, _segment, index) => {
    const path = segments.slice(0, index + 1).join('/');
    const folder = folders.find((item) => getFolderPathKey(item) === path);

    if (folder) {
      acc.push({
        folder,
        isCurrent: index === segments.length - 1,
      });
    }

    return acc;
  }, []);
};

const getVisibleSubfolders = (selectedFolder: FolderItem | null, folders: FolderItem[]) => {
  const currentSegments = getFolderPathSegments(selectedFolder?.path);

  return folders
    .filter((folder) => {
      const folderSegments = getFolderPathSegments(folder.path);

      if (folderSegments.length === 0) {
        return false;
      }

      if (currentSegments.length === 0) {
        return folderSegments.length === 1;
      }

      if (folderSegments.length !== currentSegments.length + 1) {
        return false;
      }

      return currentSegments.every((segment, index) => folderSegments[index] === segment);
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
};

const MediaPreview = ({
  asset,
  variant,
}: {
  asset: MediaFile;
  variant: 'browser' | 'compact' | 'selected-list' | 'selected-grid';
}) => {
  const kind = getMediaKind(asset);
  const previewUrl = getPreviewUrl(asset);
  const name = asset.name ?? `Archivo #${asset.id}`;

  const containerStyle: React.CSSProperties =
    variant === 'compact'
      ? {
          width: '78px',
          height: '78px',
          background: '#f6f6f9',
          borderRadius: '8px',
          overflow: 'hidden',
        }
      : variant === 'browser'
      ? {
          width: '100%',
          height: '132px',
          background: '#f6f6f9',
          borderRadius: '8px',
          overflow: 'hidden',
        }
      : variant === 'selected-grid'
        ? {
            width: '100%',
            height: '160px',
            background: '#f6f6f9',
            borderRadius: '12px',
            overflow: 'hidden',
          }
        : {
            width: '92px',
            height: '72px',
            background: '#f6f6f9',
            borderRadius: '10px',
            overflow: 'hidden',
          };

  const mediaStyle: React.CSSProperties =
    variant === 'compact'
      ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
      : variant === 'selected-list'
      ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
      : { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

  if (kind === 'image' && previewUrl) {
    return (
      <div style={containerStyle}>
        <img src={previewUrl} alt={asset.alternativeText ?? name} style={mediaStyle} />
      </div>
    );
  }

  if (kind === 'video' && previewUrl) {
    return (
      <div style={containerStyle}>
        <video
          src={previewUrl}
          muted
          controls
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#0f172a' }}
        />
      </div>
    );
  }

  if (kind === 'audio' && previewUrl) {
    return (
      <div
        style={{
          ...containerStyle,
          display: 'grid',
          placeItems: 'center',
          padding: variant === 'selected-list' ? '8px' : '12px',
          background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
          border: '1px solid #e2e8f0',
        }}
      >
        <audio controls src={previewUrl} style={{ width: '100%' }} />
      </div>
    );
  }

  return (
    <div
      style={{
        ...containerStyle,
        display: 'grid',
        placeItems: 'center',
        gap: '8px',
        padding: variant === 'selected-list' ? '8px' : '12px',
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        border: '1px solid #e2e8f0',
        color: '#475569',
      }}
      title={name}
    >
      <FileIcon width={variant === 'selected-list' ? 26 : 34} height={variant === 'selected-list' ? 26 : 34} />
      <Typography variant="pi" textColor="neutral600" ellipsis>
        {kind === 'file' ? 'Archivo' : kind.toUpperCase()}
      </Typography>
    </div>
  );
};

const SelectedAssetCardContent = ({
  asset,
  index,
  selectedViewMode,
  isDragging = false,
  isOverlay = false,
  onRemove,
}: SelectedAssetCardContentProps) => {
  return (
    <div
      style={{
        display: 'grid',
        gap: '10px',
        border: isDragging ? '2px solid #1d4ed8' : '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '12px',
        background: isDragging ? '#eff6ff' : '#fff',
        opacity: isDragging && !isOverlay ? 0.72 : 1,
        boxShadow: isDragging ? '0 12px 28px rgba(29,78,216,0.16)' : '0 4px 18px rgba(15,23,42,0.06)',
        cursor: 'grab',
        pointerEvents: isOverlay ? 'none' : 'auto',
        minWidth: 0,
      }}
    >
      <div
        style={
          selectedViewMode === 'grid'
            ? {
                display: 'grid',
                gridTemplateRows: '160px auto auto',
                gap: '10px',
                alignItems: 'start',
                position: 'relative'
              }
            : {
                display: 'grid',
                gridTemplateColumns: '92px 1fr auto',
                gap: '12px',
                alignItems: 'center',
                position: 'relative'
              }
        }
      >
        <MediaPreview asset={asset} variant={selectedViewMode === 'grid' ? 'selected-grid' : 'selected-list'} />

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#1d4ed8',
                background: '#eff6ff',
                borderRadius: '999px',
                padding: '4px 8px',
              }}
            >
              {index != null ? `#${index + 1}` : 'Arrastrando'}
            </span>
            <span
              style={{
                fontSize: '13px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {asset.name ?? `Archivo #${asset.id}`}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#666687' }}>
            {selectedViewMode === 'grid'
              ? 'Drag and drop this card to reorder in the grid.'
              : 'Drag to move this image to any position.'}
          </div>
        </div>

        <div style={selectedViewMode === 'grid' ? removeButtonImageGridStyle : removeButtonImageListStyle}>
          <IconButton
            label="Remove"
            children={<Trash />}
            type="button"
            onClick={() => onRemove(asset.id)}
            variant="danger"
          />
        </div>
      </div>
    </div>
  );
};

const SortableSelectedAssetCard = ({
  asset,
  index,
  selectedViewMode,
  isOverlay = false,
  onRemove,
  disabled = false,
}: SortableSelectedAssetCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: asset.id,
    disabled,
    strategy: selectedViewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      <SelectedAssetCardContent
        asset={asset}
        index={index}
        selectedViewMode={selectedViewMode}
        isDragging={isDragging}
        isOverlay={isOverlay}
        onRemove={onRemove}
      />
    </div>
  );
};

const SelectedGalleryEndDropZone = ({ selectedViewMode }: { selectedViewMode: SelectedViewMode }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'selected-gallery-end',
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        height: selectedViewMode === 'grid' ? '48px' : '28px',
        borderRadius: '16px',
        border: isOver ? '2px dashed #1d4ed8' : '1px dashed transparent',
        background: isOver ? 'rgba(29, 78, 216, 0.08)' : 'transparent',
        transition: 'background 140ms ease, border-color 140ms ease',
      }}
    />
  );
};

export const CustomMediaInput = React.forwardRef<HTMLDivElement, MediaInputProps>(
  ({ attribute: { allowedTypes = ['images' as AllowedType], multiple = false } = {}, label, hint, disabled, name, required }, ref) => {
    const { onChange, value, error } = useField(name);
    const { get } = useFetchClient();
    const NativeMediaInput = React.useMemo(() => getNativeMediaField(), []);

    const selectedAssets = React.useMemo(() => toArray(value), [value]);

    const [open, setOpen] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<BrowserTab>('browser');
    const [folders, setFolders] = React.useState<FolderItem[]>([]);
    const [files, setFiles] = React.useState<MediaFile[]>([]);
    const [loadingFolders, setLoadingFolders] = React.useState(false);
    const [loadingFiles, setLoadingFiles] = React.useState(false);
    const [selectedFolderId, setSelectedFolderId] = React.useState<number | null>(null);
    const [pagination, setPagination] = React.useState<PaginationInfo>(DEFAULT_PAGINATION);
    const [tempSelectedAssets, setTempSelectedAssets] = React.useState<MediaFile[]>([]);
    const [preferNativeDialog, setPreferNativeDialog] = React.useState(false);
    const [selectedViewMode, setSelectedViewMode] = React.useState<SelectedViewMode>('list');
    const [activeDragId, setActiveDragId] = React.useState<number | null>(null);

    const tempSelectedMap = React.useMemo(() => selectedIdsToMap(tempSelectedAssets), [tempSelectedAssets]);
    const currentFolder = React.useMemo(() => getCurrentFolder(selectedFolderId, folders), [folders, selectedFolderId]);
    const folderBreadcrumbs = React.useMemo(() => getFolderBreadcrumbs(currentFolder, folders), [currentFolder, folders]);
    const visibleSubfolders = React.useMemo(() => getVisibleSubfolders(currentFolder, folders), [currentFolder, folders]);
    const selectedSortableIds = React.useMemo(() => tempSelectedAssets.map((asset) => asset.id), [tempSelectedAssets]);
    const activeDragAsset = React.useMemo(
      () => tempSelectedAssets.find((asset) => asset.id === activeDragId) ?? null,
      [activeDragId, tempSelectedAssets]
    );
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 6,
        },
      }),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      })
    );

    const fetchFolders = React.useCallback(async () => {
      setLoadingFolders(true);
      try {
        const response = await get('/upload/folders?pagination[page]=1&pagination[pageSize]=200&sort=name:asc');
        const payload = response.data ?? {};
        const folderItems = (payload.results ?? payload.data ?? []) as FolderItem[];
        setFolders(folderItems);
      } catch {
        setFolders([]);
      } finally {
        setLoadingFolders(false);
      }
    }, [get]);

    const fetchFiles = React.useCallback(async () => {
      setLoadingFiles(true);
      try {
        // Formato correcto para endpoint /upload/files en Strapi v5
        const queryParts: string[] = [
          `page=${pagination.page}`,
          `pageSize=${pagination.pageSize}`,
          `sort=updatedAt:DESC`,
        ];

        // Construir el folderPath basado en selectedFolderId
        let folderPath = '';
        if (selectedFolderId) {
          const folder = folders.find((f) => f.id === selectedFolderId);
          folderPath = folder?.path ?? '/';
        } else {
          folderPath = '/';
        }

        queryParts.push(`filters[$and][0][folderPath][$eq]=${folderPath}`);
        queryParts.push('folder=');

        const queryString = queryParts.join('&');
        const response = await get(`/upload/files?${queryString}`);
        
        const payload = response.data ?? {};
        const responseFiles = (payload.results ?? payload.data ?? []) as MediaFile[];
        const allowedFiles = responseFiles.filter((file) => isAllowedByType(file, allowedTypes));
        
        // Leer paginación de la respuesta
        const respPagination = payload.pagination ?? {};
        const pageCount = respPagination.pageCount ?? 1;
        const total = respPagination.total ?? 0;

        setFiles(allowedFiles);
        setPagination({
          page: respPagination.page ?? pagination.page,
          pageSize: respPagination.pageSize ?? pagination.pageSize,
          pageCount,
          total,
        });
      } catch (error) {
        console.error('Error fetching files:', error);
        setFiles([]);
        setPagination((prev) => ({ ...prev, pageCount: 1, total: 0 }));
      } finally {
        setLoadingFiles(false);
      }
    }, [allowedTypes, get, pagination.page, pagination.pageSize, selectedFolderId, folders]);

    React.useEffect(() => {
      if (!open) return;
      fetchFolders();
    }, [fetchFolders, open]);

    React.useEffect(() => {
      if (!open) return;
      fetchFiles();
    }, [open, pagination.page, pagination.pageSize, selectedFolderId, allowedTypes]);

    React.useEffect(() => {
      if (!open) {
        setActiveDragId(null);
      }
    }, [open]);

    const applyChange = React.useCallback(
      (nextAssets: MediaFile[]) => {
        if (multiple) {
          onChange(name, nextAssets.length ? nextAssets : null);
        } else {
          onChange(name, nextAssets[0] ?? null);
        }
      },
      [multiple, name, onChange]
    );

    const removeSelected = (id: number) => {
      applyChange(selectedAssets.filter((item) => item.id !== id));
    };

    const openBrowser = () => {
      setTempSelectedAssets(selectedAssets);
      setActiveDragId(null);
      setActiveTab('browser');
      setOpen(true);
    };

    const toggleTempAsset = (asset: MediaFile) => {
      setTempSelectedAssets((prev) => {
        const exists = prev.some((item) => item.id === asset.id);

        if (exists) {
          return prev.filter((item) => item.id !== asset.id);
        }

        if (!multiple) {
          return [asset];
        }

        return [...prev, asset];
      });
    };

    const removeTempSelected = (id: number) => {
      setTempSelectedAssets((prev) => prev.filter((asset) => asset.id !== id));
    };

    const confirmBrowserSelection = () => {
      applyChange(tempSelectedAssets);
      setOpen(false);
    };
    const handleDragStart = React.useCallback((event: DragStartEvent) => {
      setActiveDragId(Number(event.active.id));
    }, []);

    const handleDragOver = React.useCallback((event: DragOverEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      const activeId = Number(active.id);
      const overId = String(over.id) === 'selected-gallery-end' ? 'selected-gallery-end' : Number(over.id);

      setTempSelectedAssets((items) => {
        const oldIndex = items.findIndex((item) => item.id === activeId);
        if (oldIndex === -1) {
          return items;
        }

        if (overId === 'selected-gallery-end') {
          const lastIndex = items.length - 1;
          if (oldIndex === lastIndex) {
            return items;
          }
          return arrayMove(items, oldIndex, lastIndex);
        }

        const newIndex = items.findIndex((item) => item.id === overId);
        if (newIndex === -1 || oldIndex === newIndex) {
          return items;
        }

        return arrayMove(items, oldIndex, newIndex);
      });
    }, []);

    const handleDragEnd = React.useCallback((_event: DragEndEvent) => {
      setActiveDragId(null);
    }, []);

    const handleDragCancel = React.useCallback((_event?: DragCancelEvent) => {
      setActiveDragId(null);
    }, []);

    const compactPreviewAssets = selectedAssets.slice(0, 8);

    const goToFolder = (folderId: number | null) => {
      setSelectedFolderId(folderId);
      setPagination((prev) => ({ ...prev, page: 1 }));
    };

    return <React.Fragment>
      <div style={{paddingBlock: 4}}>
        <Switch 
          visibleLabels 
          onLabel='Enhanced File Browser On'
          offLabel='Enhanced File Browser Off'
          checked={!preferNativeDialog} 
          onCheckedChange={(checked: boolean) => setPreferNativeDialog(!checked)} />
      </div>
    
      <DesignSystemProvider>
        {(preferNativeDialog && NativeMediaInput) ? 
          <div ref={ref}>
            <div
              style={{
                border: '1px solid #dcdce4',
                borderRadius: '8px',
                padding: '14px',
                background: '#fff',
                display: 'grid',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Legacy Mode</div>
                  <div style={{ fontSize: '12px', color: '#666687' }}>
                    This mode uses the original Strapi media library input. The new enhanced browser is available to toggle using the switch above.
                  </div>
                </div>
              </div>

              <NativeMediaInput
                attribute={{ allowedTypes, multiple }}
                disabled={disabled}
                hint={hint}
                label={label}
                name={name}
                required={required}
              />
            </div>
          </div>
          :
          <div ref={ref}>
            <div style={{ border: '1px solid #dcdce4', borderRadius: '8px', padding: '14px', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Selected Assets (<span>{label ?? name}</span><span aria-hidden="true" className="sc-beySbL ceLAnO sc-dmyDGl heFXNT">{required ? '*': ''}</span>)</div>
                  <div style={{ fontSize: '12px', color: '#666687' }}>
                    {selectedAssets.length === 0 ? 'No files selected.' : `${selectedAssets.length} files selected.`}
                  </div>
                </div>

                {selectedAssets.length == 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Button type="button" onClick={openBrowser} disabled={disabled} startIcon={<Pencil />}>
                      Select Files
                    </Button>
                  </div>
                )}
              </div>

              {selectedAssets.length > 0 ? (
                <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {compactPreviewAssets.map((asset) => (
                      <div
                        key={asset.id}
                        style={{
                          width: '78px',
                          height: '78px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '1px solid #ececf3',
                          background: '#f6f6f9',
                        }}
                        title={asset.name ?? `File #${asset.id}`}
                      >
                        <MediaPreview asset={asset} variant="compact" />
                      </div>
                    ))}
                    {selectedAssets.length > compactPreviewAssets.length ? (
                      <div
                        style={{
                          width: '78px',
                          height: '78px',
                          borderRadius: '8px',
                          border: '1px dashed #c0c0cf',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          color: '#666687',
                          background: '#fafafd',
                        }}
                      >
                        +{selectedAssets.length - compactPreviewAssets.length}
                      </div>
                    ) : null}
                    {!disabled && 
                      <Tooltip label="Edit Images" side='right' align='center'>
                        <button
                          disabled={disabled}
                          onClick={openBrowser}
                          style={{
                            width: '78px',
                            height: '78px',
                            borderRadius: '8px',
                            border: '1px dashed #4945ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            color: '#666687',
                            background: '#fafafd',
                            cursor: 'pointer'
                          }}
                          className='editGalleryButton'>
                          <Pencil fill='primary600' />
                        </button>
                      </Tooltip>
                    }
                  </div>

                </div>
              ) : null}
            </div>

            {hint ? <div style={{ marginTop: '6px', color: '#666687', fontSize: '12px' }}>{hint}</div> : null}
            {error ? <div style={{ marginTop: '6px', color: '#d02b20', fontSize: '12px' }}>{String(error)}</div> : null}

            {open ? (
              <Modal.Root open={open} onOpenChange={setOpen}>
                
                <Modal.Content>
                  {loadingFiles ? <div style={cmlLoaderDivStyle}><Loader>Loading content...</Loader></div> : null}
                  <Modal.Header>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                      <div>
                        <Modal.Title>Enhanced File Browser</Modal.Title>
                        <div style={{ fontSize: '13px', color: '#666687', marginTop: '4px' }}>
                          Select files in the browser and order them within the selected files tab.
                        </div>
                      </div>
                    </div>
                  </Modal.Header>
                  <Modal.Body style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0, gap: 0 }}>
                    <Tabs.Root
                      variant="simple"
                      value={activeTab}
                      onValueChange={(value: string) => setActiveTab(value as BrowserTab)}
                    >
                      <Tabs.List>
                        <Tabs.Trigger value="browser">
                          <Typography  variant="sigma">Browse</Typography >                        
                        </Tabs.Trigger>
                        <Tabs.Trigger value="selected">
                          <Typography  variant="sigma">Selected Files <Badge>{tempSelectedAssets.length}</Badge></Typography>                        
                        </Tabs.Trigger>
                      </Tabs.List>
                      <Divider />
                      <Tabs.Content value="browser" style={{ minHeight: 0, overflow: 'hidden' }}>
                        <div
                          style={{
                            display: 'grid',
                            gap: '16px',
                            minHeight: 0,
                            padding: '16px',
                            background: 'linear-gradient(180deg, #fcfcff 0%, #ffffff 100%)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'grid', gap: '4px' }}>
                              <Typography variant="sigma" textColor="neutral800">
                                File Explorer
                              </Typography>
                              <Typography variant="pi" textColor="neutral600">
                                Folders appear above the current path to navigate without losing context.
                              </Typography>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <Button
                                type="button"
                                variant="secondary"
                                startIcon={<Folder />}
                                onClick={() => goToFolder(null)}
                                disabled={selectedFolderId === null}
                              >
                                Root
                              </Button>
                            </div>
                          </div>

                          <Breadcrumbs label="Ruta actual">
                            <Crumb>
                              <CrumbLink
                                href="#"
                                onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                                  event.preventDefault();
                                  goToFolder(null);
                                }}
                              >
                                Root
                              </CrumbLink>
                            </Crumb>

                            {folderBreadcrumbs.map(({ folder, isCurrent }) =>
                              isCurrent ? (
                                <Crumb key={folder.id} isCurrent>
                                  {folder.name}
                                </Crumb>
                              ) : (
                                <Crumb key={folder.id}>
                                  <CrumbLink
                                    href="#"
                                    onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                                      event.preventDefault();
                                      goToFolder(folder.id);
                                    }}
                                  >
                                    {folder.name}
                                  </CrumbLink>
                                </Crumb>
                              )
                            )}
                          </Breadcrumbs>

                          <div style={{ display: 'grid', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'grid', gap: '2px' }}>
                                <Typography variant="sigma" textColor="neutral800">
                                  Folders
                                </Typography>
                              </div>
                              <Typography variant="pi" textColor="neutral600">
                                {visibleSubfolders.length} folder(s)
                              </Typography>
                            </div>

                            {loadingFolders ? (
                              <Typography variant="pi" textColor="neutral600">
                                Loading folders...
                              </Typography>
                            ) : visibleSubfolders.length > 0 ? (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                                {visibleSubfolders.map((folder) => {
                                  const isCurrentFolder = selectedFolderId === folder.id;

                                  return (
                                    <Button
                                      key={folder.id}
                                      type="button"
                                      variant={isCurrentFolder ? 'default' : 'secondary'}
                                      startIcon={<Folder />}
                                      onClick={() => goToFolder(folder.id)}
                                      fullWidth
                                      size="S"
                                    >
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {folder.name}
                                        </span>
                                        {isCurrentFolder ? (
                                          <Badge>Actual</Badge>
                                        ) : null}
                                      </span>
                                    </Button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div
                                style={{
                                  border: '1px dashed #c0c0cf',
                                  borderRadius: '12px',
                                  padding: '16px',
                                  color: '#666687',
                                  background: '#fafafd',
                                  fontSize: '12px',
                                }}
                              >
                                This folder has no visible subfolders.
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'grid', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'grid', gap: '2px' }}>
                                <Typography variant="sigma" textColor="neutral800">
                                  Files
                                </Typography>
                              </div>
                            </div>
                            
                            {!loadingFiles && files.length === 0 ? (
                              <div style={{ color: '#666687' }}>No files in this folder or page.</div>
                            ) : null}
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                                gap: '12px',
                              }}
                            >
                              {files.map((file) => {
                                const checked = Boolean(tempSelectedMap[file.id]);
                                return (
                                  <div
                                    key={file.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => toggleTempAsset(file)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        toggleTempAsset(file);
                                      }
                                    }}
                                    style={{
                                      border: checked ? '2px solid #1d4ed8' : '1px solid #e5e7eb',
                                      borderRadius: '12px',
                                      padding: '10px',
                                      display: 'grid',
                                      gap: '8px',
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      background: checked ? '#f8fbff' : '#fff',
                                    }}
                                  >
                                    <MediaPreview asset={file} variant="browser" />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' }}>
                                      <div
                                        style={{
                                          fontSize: '12px',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          minWidth: 0,
                                          textWrap: 'auto',
                                          overflowWrap: 'anywhere',
                                        }}
                                      >
                                        {file.name ?? `Archivo #${file.id}`}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '11px',
                                          color: checked ? '#28b64c' : '#666687',
                                          fontWeight: 700,
                                          flexShrink: 0,
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}
                                      >
                                        {checked ? <CheckCircle /> : null}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                          </div>
                        </div>
                      </Tabs.Content>
                      <Tabs.Content value="selected">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          autoScroll
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDragEnd={handleDragEnd}
                          onDragCancel={handleDragCancel}
                        >
                          <div
                            style={{
                              padding: '16px',
                              overflow: 'auto',
                              background: 'linear-gradient(180deg, #fffdf8 0%, #ffffff 100%)',
                              flex: 1,
                            }}
                          >
                            {tempSelectedAssets.length === 0 ? (
                              <div style={{ color: '#666687' }}>There are no selected assets in the gallery.</div>
                            ) : (
                              <div style={{ display: 'grid', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: '13px', color: '#666687' }}>
                                    Drag any card to reorder the gallery. The order you see here will be the final order.
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <IconButtonGroup>
                                      <IconButton onClick={() => setSelectedViewMode('list')} children={<BulletList />} label="List" />
                                      <IconButton onClick={() => setSelectedViewMode('grid')} children={<GridFour />} label="Grid" />
                                    </IconButtonGroup>
                                  </div>
                                </div>

                                <SortableContext
                                  items={selectedSortableIds}
                                  strategy={selectedViewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
                                >
                                  <div
                                    style={
                                      selectedViewMode === 'grid'
                                        ? {
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                                            gap: '12px',
                                            alignItems: 'start',
                                          }
                                        : {
                                            display: 'grid',
                                            gap: '10px',
                                            maxWidth: '100%',
                                          }
                                    }
                                  >
                                    {tempSelectedAssets.map((asset, index) => (
                                      <SortableSelectedAssetCard
                                        key={asset.id}
                                        asset={asset}
                                        index={index}
                                        selectedViewMode={selectedViewMode}
                                        disabled={!multiple}
                                        onRemove={removeTempSelected}
                                      />
                                    ))}

                                    <SelectedGalleryEndDropZone selectedViewMode={selectedViewMode} />
                                  </div>
                                </SortableContext>
                              </div>
                            )}
                          </div>

                          {activeDragAsset && typeof document !== 'undefined'
                            ? createPortal(
                                <DragOverlay adjustScale={false}>
                                  <SelectedAssetCardContent
                                    asset={activeDragAsset}
                                    index={tempSelectedAssets.findIndex((asset) => asset.id === activeDragAsset.id)}
                                    selectedViewMode={selectedViewMode}
                                    isDragging
                                    isOverlay
                                    onRemove={removeTempSelected}
                                  />
                                </DragOverlay>,
                                document.body
                              )
                            : null}
                        </DndContext>
                      </Tabs.Content>
                    </Tabs.Root>
                  </Modal.Body>
                  <Modal.Footer>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {activeTab === 'browser' ? (
                          <>
                            <TextButton 
                              startIcon={<ArrowLeft />} 
                              onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                              disabled={pagination.page <= 1}>
                              Previous Page
                            </TextButton>
                            <TextButton 
                              endIcon={<ArrowRight />} 
                              onClick={() =>
                                setPagination((prev) => ({
                                  ...prev,
                                  page: Math.min(prev.pageCount || prev.page + 1, prev.page + 1),
                                }))
                              }
                              disabled={pagination.page >= pagination.pageCount}>
                              Next Page
                            </TextButton>
                          </>
                        ) : <span style={{ fontSize: 12, color: '#666687' }}>{`${tempSelectedAssets.length} selected file(s)`}</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666687' }}>
                        {activeTab === 'browser'
                          ? `Page ${pagination.page} of ${pagination.pageCount}`
                          : null}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button type="button" onClick={() => setOpen(false)} variant={"danger-light"}>
                          Cancel
                        </Button>
                        <Button type="button" onClick={confirmBrowserSelection} startIcon={<CheckCircle />}>
                          Confirm
                        </Button>
                      </div>
                    </div>
                  </Modal.Footer>
                </Modal.Content>
                
              </Modal.Root>
            ) : null}

          </div>
        }
      </DesignSystemProvider>
    </React.Fragment>
  }
);

CustomMediaInput.displayName = 'CustomMediaInput';
