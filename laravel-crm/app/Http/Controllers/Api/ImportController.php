<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LeadImport;
use App\Services\DuplicateService;
use App\Services\LeadService;
use Illuminate\Http\Request;

class ImportController extends Controller
{
    public function __construct(private LeadService $leads, private DuplicateService $duplicates) {}

    /** Preview parsed rows + duplicate flags (A5). */
    public function preview(Request $request)
    {
        $rows = $this->parse($request);
        $out = [];
        foreach ($rows as $i => $row) {
            $dupe = $this->duplicates->detect($row['email'] ?? null, $row['phone'] ?? null, $row['name'] ?? null);
            $valid = ! empty($row['name']) && (! empty($row['email']) || ! empty($row['phone']));
            $out[] = [
                'row' => $i + 1,
                'data' => $row,
                'valid' => $valid,
                'duplicate' => $dupe['block'] ? $dupe['reason'] : ($dupe['flag'] ? $dupe['reason'] : null),
            ];
        }
        return response()->json(['rows' => $out, 'total' => count($out)]);
    }

    /** Commit import; per-row status + error log (A5). */
    public function commit(Request $request)
    {
        $rows = $this->parse($request);
        $skipDuplicates = $request->boolean('skip_duplicates', true);

        $imported = 0; $failed = 0; $duplicates = 0; $errors = [];
        foreach ($rows as $i => $row) {
            if (empty($row['name']) || (empty($row['email']) && empty($row['phone']))) {
                $failed++;
                $errors[] = ['row' => $i + 1, 'error' => 'Missing name or contact', 'data' => $row];
                continue;
            }
            $row['source'] = $row['source'] ?? 'Bulk Import';
            $result = $this->leads->capture($row, ! $skipDuplicates);
            if ($result['status'] === 'duplicate') {
                $duplicates++;
                $errors[] = ['row' => $i + 1, 'error' => 'Duplicate ('.$result['duplicate']['reason'].')', 'data' => $row];
            } else {
                $imported++;
            }
        }

        $record = LeadImport::create([
            'user_id' => $request->user()->id,
            'filename' => $request->input('filename', 'upload.csv'),
            'total' => count($rows),
            'imported' => $imported,
            'failed' => $failed,
            'duplicates' => $duplicates,
            'error_log' => $errors,
            'status' => 'completed',
        ]);

        return response()->json(['import' => $record]);
    }

    public function history()
    {
        return response()->json(['data' => LeadImport::latest()->limit(50)->get()]);
    }

    /** Accept a raw CSV string ("csv") or an uploaded file. */
    protected function parse(Request $request): array
    {
        $content = null;
        if ($request->hasFile('file')) {
            $content = file_get_contents($request->file('file')->getRealPath());
        } elseif ($request->filled('csv')) {
            $content = $request->input('csv');
        }
        if (! $content) {
            return [];
        }

        $lines = preg_split('/\r\n|\r|\n/', trim($content));
        if (count($lines) < 1) {
            return [];
        }
        $header = array_map(fn ($h) => strtolower(trim($h)), str_getcsv(array_shift($lines)));
        $rows = [];
        foreach ($lines as $line) {
            if (trim($line) === '') {
                continue;
            }
            $cols = str_getcsv($line);
            $row = [];
            foreach ($header as $idx => $key) {
                $row[$key] = isset($cols[$idx]) ? trim($cols[$idx]) : null;
            }
            $rows[] = $row;
        }
        return $rows;
    }
}
