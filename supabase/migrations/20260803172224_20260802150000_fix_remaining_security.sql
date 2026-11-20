/*
# Fix remaining security warnings

1. Set search_path on the old record_stock_transaction function signature
2. Revoke EXECUTE from anon on all SECURITY DEFINER functions (they should only be callable by authenticated users)
*/

-- Fix old signature of record_stock_transaction (without p_company_id param)
ALTER FUNCTION record_stock_transaction(integer, text, numeric, text, text, text) SET search_path = '';

-- Revoke EXECUTE from anon role on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION record_stock_transaction(integer, text, numeric, text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION record_stock_transaction(integer, text, numeric, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION update_stock_transaction(integer, integer, text, numeric, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION delete_stock_transaction(integer) FROM anon;
