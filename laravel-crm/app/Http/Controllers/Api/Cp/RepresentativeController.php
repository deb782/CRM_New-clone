<?php

namespace App\Http\Controllers\Api\Cp;

use App\Http\Controllers\Controller;
use App\Models\CpRepresentative;
use Illuminate\Http\Request;

class RepresentativeController extends Controller
{
    private function cp(Request $r)
    {
        return $r->attributes->get('cp');
    }

    public function index(Request $request)
    {
        $cp = $this->cp($request);
        $reps = $cp->representatives()->where('status', 'active')->withCount('leads')->orderBy('name')->get();
        return response()->json(['data' => $reps]);
    }

    public function store(Request $request)
    {
        $cp = $this->cp($request);
        $data = $request->validate([
            'name' => 'required|string|max:150',
            'phone' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:150',
        ]);
        $exists = $cp->representatives()->where('name', $data['name'])->where('status', 'active')->exists();
        if ($exists) {
            return response()->json(['message' => 'A representative with this name already exists.'], 409);
        }
        $rep = CpRepresentative::create($data + ['channel_partner_id' => $cp->id, 'status' => 'active']);
        return response()->json(['representative' => $rep], 201);
    }

    public function destroy(Request $request, CpRepresentative $representative)
    {
        abort_if($representative->channel_partner_id !== $this->cp($request)->id, 404);
        $representative->forceFill(['status' => 'inactive'])->save();
        return response()->json(['message' => 'Representative removed']);
    }
}
