-- Revoke EXECUTE from anon on the old function signatures and the helper function
REVOKE EXECUTE ON FUNCTION delete_stock_transaction(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION is_company_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION record_stock_transaction(integer, text, numeric, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION update_stock_transaction(integer, integer, text, numeric, text, text, text) FROM anon;
